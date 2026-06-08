from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import uuid
import logging
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Header, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- Storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = os.environ.get("APP_NAME", "admin-control")
_storage_key: Optional[str] = None

def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logging.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Almacenamiento no disponible")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 403:
        # key expired; re-init once
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Almacenamiento no disponible")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------- JWT ----------
JWT_ALG = "HS256"
JWT_SECRET = os.environ['JWT_SECRET']

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

# ---------- Models ----------
class PartnerOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    color: str
    avatar_url: Optional[str] = None
    must_change_password: bool = False

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class LoginOut(BaseModel):
    user: PartnerOut
    access_token: str

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

ProjectStatus = Literal["in_progress", "completed", "started", "paid", "with_debt"]

# Project
class ProjectIn(BaseModel):
    name: str
    description: Optional[str] = ""
    client_name: Optional[str] = ""  # legacy, kept for backwards compatibility
    client_id: Optional[str] = None
    status: ProjectStatus = "in_progress"
    start_date: str  # ISO date
    end_date: Optional[str] = None
    file_ids: List[str] = Field(default_factory=list)

class ProjectOut(ProjectIn):
    id: str
    code: Optional[str] = None  # auto-incremental, e.g. "1000"
    created_at: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by_id: Optional[str] = None
    updated_by_name: Optional[str] = None

# Transaction
TxType = Literal["income", "expense"]
TxMethod = Literal["cash", "transfer"]
TxCategory = Literal["general", "taxes", "accountant", "travel", "materials", "labor", "services", "other"]

class TransactionIn(BaseModel):
    type: TxType
    amount: float
    payment_method: TxMethod
    description: str
    counterparty: Optional[str] = ""  # legacy free-text
    client_id: Optional[str] = None  # for income
    provider_id: Optional[str] = None  # for expense
    category: TxCategory = "general"
    project_id: Optional[str] = None
    partner_id: str  # who made the payment / owns the debt
    paid_personally: bool = False  # paid from own pocket -> company owes them
    date: str  # ISO date
    file_id: Optional[str] = None

class TransactionOut(TransactionIn):
    id: str
    created_at: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by_id: Optional[str] = None
    updated_by_name: Optional[str] = None
    reimbursement_status: Optional[str] = None  # 'reimbursed' | 'partial' | 'pending' | None
    reimbursed_amount: Optional[float] = None
    remaining_balance: Optional[float] = None

# Dividend (Retiro)
class DividendIn(BaseModel):
    partner_id: str
    amount: float
    payment_method: TxMethod = "transfer"
    description: Optional[str] = ""
    date: str

class DividendOut(DividendIn):
    id: str
    created_at: str

# Reimbursement (Reembolso): the company pays back a partner for personal expenses
class ReimbursementIn(BaseModel):
    partner_id: str
    amount: float
    payment_method: TxMethod = "transfer"
    description: Optional[str] = ""
    date: str
    source_transaction_ids: List[str] = Field(default_factory=list)
    # Optional partial-reimbursement map: {tx_id: amount_applied_to_that_tx}.
    # If a tx_id appears in source_transaction_ids but NOT in partials, the
    # full remaining balance of that tx is consumed.
    partials: Optional[dict] = None
    file_id: Optional[str] = None

class ReimbursementOut(ReimbursementIn):
    id: str
    created_at: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None

# ---- Hub de Socios (shared workspace) ----
HubType = Literal["note", "credential", "link", "file"]

class HubCommentIn(BaseModel):
    text: str

class HubCommentOut(BaseModel):
    id: str
    text: str
    created_at: str
    created_by_id: str
    created_by_name: str

class HubItemIn(BaseModel):
    type: HubType
    title: str
    content: Optional[str] = ""            # note body / link description / file description / credential notes
    url: Optional[str] = ""                # link/url field (credenciales + enlaces)
    username: Optional[str] = ""           # credential only
    password: Optional[str] = ""           # credential only (stored as plain — solo socios)
    file_id: Optional[str] = None          # file type
    tags: List[str] = Field(default_factory=list)
    pinned: bool = False

class HubItemOut(HubItemIn):
    id: str
    created_at: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by_id: Optional[str] = None
    updated_by_name: Optional[str] = None
    comments: List[HubCommentOut] = Field(default_factory=list)

# ---- Loan alert settings ----
class LoanAlertSettings(BaseModel):
    threshold_amount: float = 5000.0
    threshold_days: int = 30

# Client / Provider catalogs
class ContactIn(BaseModel):
    name: str
    rfc: Optional[str] = ""
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    notes: Optional[str] = ""

class ClientIn(ContactIn):
    pass

class ProviderIn(ContactIn):
    category: Optional[str] = "general"  # services, materials, taxes, etc.

class ContactOut(BaseModel):
    id: str
    name: str
    rfc: Optional[str] = ""
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by_id: Optional[str] = None
    updated_by_name: Optional[str] = None

class ClientOut(ContactOut):
    pass

class ProviderOut(ContactOut):
    category: Optional[str] = "general"

# ---------- App ----------
app = FastAPI(title="Admin Control")
api = APIRouter(prefix="/api")

# ---------- Auth dep ----------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def partner_to_out(u: dict) -> PartnerOut:
    return PartnerOut(
        id=u["id"], email=u["email"], name=u["name"],
        color=u.get("color", "#002FA7"), avatar_url=u.get("avatar_url"),
        must_change_password=bool(u.get("must_change_password", False)),
    )

# ---------- Audit log ----------
ENTITY_LABELS = {
    "transaction": "Transacción",
    "project": "Proyecto",
    "dividend": "Retiro",
    "reimbursement": "Reembolso",
    "file": "Archivo",
    "client": "Cliente",
    "provider": "Proveedor",
}
ACTION_LABELS = {"create": "Creó", "update": "Editó", "delete": "Eliminó"}

async def log_audit(action: str, entity_type: str, entity_id: str, user: dict, label: str = ""):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "label": label,
        "actor_id": user["id"],
        "actor_name": user["name"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

def stamp_create(doc: dict, user: dict) -> dict:
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by_id"] = user["id"]
    doc["created_by_name"] = user["name"]
    return doc

def stamp_update(update: dict, user: dict) -> dict:
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by_id"] = user["id"]
    update["updated_by_name"] = user["name"]
    return update

# ---------- Auth ----------
@api.post("/auth/login", response_model=LoginOut)
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_access_token(user["id"], user["email"])
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=False, samesite="lax", max_age=43200, path="/",
    )
    return LoginOut(user=partner_to_out(user), access_token=token)

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me", response_model=PartnerOut)
async def me(user: dict = Depends(get_current_user)):
    return partner_to_out(user)

MIN_PASSWORD_LEN = 8

@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    new_pw = payload.new_password
    if len(new_pw) < MIN_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail=f"La nueva contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres")
    if new_pw == payload.current_password:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta a la actual")
    new_hash = hash_password(new_pw)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash, "must_change_password": False,
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}

@api.get("/partners", response_model=List[PartnerOut])
async def list_partners(_: dict = Depends(get_current_user)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    docs.sort(key=lambda d: d.get("order", 99))
    return [partner_to_out(d) for d in docs]

async def _next_project_code() -> str:
    """Atomically grab the next project code. Starts at 1000."""
    res = await db.counters.find_one_and_update(
        {"_id": "project_seq"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    # If counter just initialized at 0, set to 1000
    seq = res.get("seq", 1) if res else 1
    if seq < 1000:
        # initialize to 1000
        await db.counters.update_one({"_id": "project_seq"}, {"$set": {"seq": 1000}})
        seq = 1000
    return str(seq)

# ---------- Projects ----------
@api.post("/projects", response_model=ProjectOut)
async def create_project(payload: ProjectIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["code"] = await _next_project_code()
    stamp_create(doc, user)
    await db.projects.insert_one(doc.copy())
    await log_audit("create", "project", doc["id"], user, f"{doc['code']} · {doc.get('name', '')}")
    doc.pop("_id", None)
    return ProjectOut(**doc)

@api.get("/projects", response_model=List[ProjectOut])
async def list_projects(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    q: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {}
    if status: query["status"] = status
    if client_id: query["client_id"] = client_id
    if q: query["name"] = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [ProjectOut(**d) for d in docs]

@api.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, _: dict = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proyecto no encontrado")
    return ProjectOut(**doc)

@api.put("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: str, payload: ProjectIn, user: dict = Depends(get_current_user)):
    upd = payload.model_dump()
    stamp_update(upd, user)
    res = await db.projects.update_one({"id": project_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Proyecto no encontrado")
    await log_audit("update", "project", project_id, user, upd.get("name", ""))
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return ProjectOut(**doc)

@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    await db.projects.delete_one({"id": project_id})
    if doc:
        await log_audit("delete", "project", project_id, user, doc.get("name", ""))
    return {"ok": True}

@api.get("/projects/{project_id}/pnl")
async def project_pnl(project_id: str, _: dict = Depends(get_current_user)):
    proj = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not proj:
        raise HTTPException(404, "Proyecto no encontrado")
    txs = await db.transactions.find({"project_id": project_id}, {"_id": 0}).to_list(2000)
    income = sum(t["amount"] for t in txs if t["type"] == "income")
    expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    return {
        "project": proj,
        "income": income,
        "expenses": expenses,
        "net": income - expenses,
        "transactions": txs,
    }

# ---------- Transactions ----------
async def _reimbursed_amount_by_tx() -> dict:
    """Return {tx_id: amount_reimbursed} aggregating partials across all reimbursements.
    For legacy reimbursement records (no `partials`), we treat each linked source_transaction_id
    as fully covered by that reimbursement (using the tx's own amount as the cap).
    """
    rbs = await db.reimbursements.find(
        {}, {"_id": 0, "source_transaction_ids": 1, "partials": 1}
    ).to_list(5000)
    legacy_ids: set = set()
    out: dict = {}
    for r in rbs:
        p = r.get("partials") or {}
        for sid in (r.get("source_transaction_ids") or []):
            if sid in p:
                out[sid] = out.get(sid, 0.0) + float(p[sid])
            else:
                legacy_ids.add(sid)
    if legacy_ids:
        legacy_txs = await db.transactions.find(
            {"id": {"$in": list(legacy_ids)}}, {"_id": 0, "id": 1, "amount": 1}
        ).to_list(len(legacy_ids))
        for t in legacy_txs:
            out[t["id"]] = out.get(t["id"], 0.0) + float(t["amount"])
    return out

async def _decorate_txs(txs: List[dict]) -> List[dict]:
    """Attach reimbursement_status to personal expenses based on remaining balance."""
    reimbursed = await _reimbursed_amount_by_tx()
    for t in txs:
        if t.get("type") == "expense" and t.get("paid_personally"):
            paid = float(reimbursed.get(t["id"], 0.0))
            amt = float(t.get("amount") or 0)
            remaining = round(amt - paid, 2)
            t["reimbursed_amount"] = round(paid, 2)
            t["remaining_balance"] = remaining
            if remaining <= 0.005:
                t["reimbursement_status"] = "reimbursed"
            elif paid > 0.005:
                t["reimbursement_status"] = "partial"
            else:
                t["reimbursement_status"] = "pending"
        else:
            t["reimbursement_status"] = None
            t["reimbursed_amount"] = None
            t["remaining_balance"] = None
    return txs

@api.post("/transactions", response_model=TransactionOut)
async def create_tx(payload: TransactionIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    stamp_create(doc, user)
    await db.transactions.insert_one(doc.copy())
    await log_audit("create", "transaction", doc["id"], user, doc.get("description", ""))
    doc.pop("_id", None)
    decorated = (await _decorate_txs([doc]))[0]
    return TransactionOut(**decorated)

@api.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(
    type: Optional[str] = None,
    partner_id: Optional[str] = None,
    project_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q = {}
    if type: q["type"] = type
    if partner_id: q["partner_id"] = partner_id
    if project_id: q["project_id"] = project_id
    if payment_method: q["payment_method"] = payment_method
    docs = await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(5000)
    docs = await _decorate_txs(docs)
    return [TransactionOut(**d) for d in docs]

@api.put("/transactions/{tx_id}", response_model=TransactionOut)
async def update_tx(tx_id: str, payload: TransactionIn, user: dict = Depends(get_current_user)):
    upd = payload.model_dump()
    stamp_update(upd, user)
    res = await db.transactions.update_one({"id": tx_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Transacción no encontrada")
    await log_audit("update", "transaction", tx_id, user, upd.get("description", ""))
    doc = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    doc = (await _decorate_txs([doc]))[0]
    return TransactionOut(**doc)

@api.delete("/transactions/{tx_id}")
async def delete_tx(tx_id: str, user: dict = Depends(get_current_user)):
    doc = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    if not doc:
        return {"ok": True}
    # Lock: an expense paid personally that still has a pending balance cannot be deleted.
    if doc.get("type") == "expense" and doc.get("paid_personally"):
        reimbursed_map = await _reimbursed_amount_by_tx()
        paid = float(reimbursed_map.get(tx_id, 0.0))
        remaining = round(float(doc.get("amount") or 0) - paid, 2)
        if remaining > 0.005:
            partner = await db.users.find_one({"id": doc.get("partner_id")}, {"_id": 0, "name": 1})
            partner_name = (partner or {}).get("name") or "el socio"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No se puede eliminar: este egreso lo pagó {partner_name} de su bolsa "
                    f"y aún se le adeudan ${remaining:.2f}. Registra primero el reembolso en el Portal de Socios."
                ),
            )
    await db.transactions.delete_one({"id": tx_id})
    await log_audit("delete", "transaction", tx_id, user, doc.get("description", ""))
    return {"ok": True}

# ---------- Dividends ----------
@api.post("/dividends", response_model=DividendOut)
async def create_dividend(payload: DividendIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    stamp_create(doc, user)
    await db.dividends.insert_one(doc.copy())
    await log_audit("create", "dividend", doc["id"], user, f"Retiro {doc.get('description', '')}")
    doc.pop("_id", None)
    return DividendOut(**doc)

@api.get("/dividends", response_model=List[DividendOut])
async def list_dividends(partner_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {}
    if partner_id: q["partner_id"] = partner_id
    docs = await db.dividends.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return [DividendOut(**d) for d in docs]

@api.delete("/dividends/{div_id}")
async def delete_dividend(div_id: str, user: dict = Depends(get_current_user)):
    doc = await db.dividends.find_one({"id": div_id}, {"_id": 0})
    await db.dividends.delete_one({"id": div_id})
    if doc:
        await log_audit("delete", "dividend", div_id, user, doc.get("description", ""))
    return {"ok": True}

# ---------- Clients ----------
@api.post("/clients", response_model=ClientOut)
async def create_client(payload: ClientIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    stamp_create(doc, user)
    await db.clients.insert_one(doc.copy())
    await log_audit("create", "client", doc["id"], user, doc.get("name", ""))
    doc.pop("_id", None)
    return ClientOut(**doc)

@api.get("/clients", response_model=List[ClientOut])
async def list_clients(q: Optional[str] = None, _: dict = Depends(get_current_user)):
    query = {}
    if q:
        query["name"] = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.clients.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return [ClientOut(**d) for d in docs]

@api.get("/clients/{client_id}", response_model=ClientOut)
async def get_client(client_id: str, _: dict = Depends(get_current_user)):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente no encontrado")
    return ClientOut(**doc)

@api.put("/clients/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, payload: ClientIn, user: dict = Depends(get_current_user)):
    upd = payload.model_dump()
    stamp_update(upd, user)
    res = await db.clients.update_one({"id": client_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Cliente no encontrado")
    await log_audit("update", "client", client_id, user, upd.get("name", ""))
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return ClientOut(**doc)

@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente no encontrado")
    in_tx = await db.transactions.count_documents({"client_id": client_id})
    in_proj = await db.projects.count_documents({"client_id": client_id})
    if in_tx > 0 or in_proj > 0:
        parts = []
        if in_tx: parts.append(f"{in_tx} transaccion{'es' if in_tx != 1 else ''}")
        if in_proj: parts.append(f"{in_proj} proyecto{'s' if in_proj != 1 else ''}")
        raise HTTPException(409, f"No se puede eliminar: vinculado a {' y '.join(parts)}.")
    await db.clients.delete_one({"id": client_id})
    await log_audit("delete", "client", client_id, user, doc.get("name", ""))
    return {"ok": True}

# ---------- Providers ----------
@api.post("/providers", response_model=ProviderOut)
async def create_provider(payload: ProviderIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    stamp_create(doc, user)
    await db.providers.insert_one(doc.copy())
    await log_audit("create", "provider", doc["id"], user, doc.get("name", ""))
    doc.pop("_id", None)
    return ProviderOut(**doc)

@api.get("/providers", response_model=List[ProviderOut])
async def list_providers(q: Optional[str] = None, _: dict = Depends(get_current_user)):
    query = {}
    if q:
        query["name"] = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.providers.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return [ProviderOut(**d) for d in docs]

@api.get("/providers/{provider_id}", response_model=ProviderOut)
async def get_provider(provider_id: str, _: dict = Depends(get_current_user)):
    doc = await db.providers.find_one({"id": provider_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proveedor no encontrado")
    return ProviderOut(**doc)

@api.put("/providers/{provider_id}", response_model=ProviderOut)
async def update_provider(provider_id: str, payload: ProviderIn, user: dict = Depends(get_current_user)):
    upd = payload.model_dump()
    stamp_update(upd, user)
    res = await db.providers.update_one({"id": provider_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Proveedor no encontrado")
    await log_audit("update", "provider", provider_id, user, upd.get("name", ""))
    doc = await db.providers.find_one({"id": provider_id}, {"_id": 0})
    return ProviderOut(**doc)

@api.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str, user: dict = Depends(get_current_user)):
    doc = await db.providers.find_one({"id": provider_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proveedor no encontrado")
    in_tx = await db.transactions.count_documents({"provider_id": provider_id})
    if in_tx > 0:
        raise HTTPException(409, f"No se puede eliminar: vinculado a {in_tx} transacciones.")
    await db.providers.delete_one({"id": provider_id})
    await log_audit("delete", "provider", provider_id, user, doc.get("name", ""))
    return {"ok": True}

# ---------- Reimbursements ----------
@api.post("/reimbursements", response_model=ReimbursementOut)
async def create_reimbursement(payload: ReimbursementIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()

    # Validate source_transaction_ids if provided:
    # 1) each tx must exist, be a personal expense of this partner
    # 2) sum(partials) per tx must not exceed remaining balance of that tx
    src_ids = list(dict.fromkeys(doc.get("source_transaction_ids") or []))  # dedupe, preserve order
    partials_in = doc.get("partials") or {}
    if src_ids:
        txs = await db.transactions.find(
            {"id": {"$in": src_ids}}, {"_id": 0, "id": 1, "partner_id": 1, "type": 1, "paid_personally": 1, "description": 1, "amount": 1}
        ).to_list(len(src_ids))
        tx_by_id = {t["id"]: t for t in txs}
        for tid in src_ids:
            t = tx_by_id.get(tid)
            if not t:
                raise HTTPException(409, "Uno de los egresos seleccionados ya no existe.")
            if t.get("type") != "expense" or not t.get("paid_personally"):
                raise HTTPException(409, "Solo egresos pagados personalmente pueden vincularse a un reembolso.")
            if t.get("partner_id") != doc.get("partner_id"):
                raise HTTPException(409, "Un egreso seleccionado no pertenece a este socio.")

        # Compute already-reimbursed amount per tx (partials sum + full links from legacy entries)
        existing = await db.reimbursements.find(
            {"source_transaction_ids": {"$in": src_ids}},
            {"_id": 0, "source_transaction_ids": 1, "partials": 1},
        ).to_list(2000)
        already_per_tx: dict = {}
        for r in existing:
            p = r.get("partials") or {}
            for sid in (r.get("source_transaction_ids") or []):
                if sid not in src_ids:
                    continue
                # if partials present for this tx, use that; else treat as full-remaining at the
                # time it was applied (we approximate as the tx's full amount minus what others
                # already partialed; for legacy records without partials we assume full coverage).
                if sid in p:
                    already_per_tx[sid] = already_per_tx.get(sid, 0.0) + float(p[sid])
                else:
                    already_per_tx[sid] = already_per_tx.get(sid, 0.0) + float(tx_by_id[sid]["amount"])

        # Validate partials and build the final partials dict
        partials_out: dict = {}
        for tid in src_ids:
            tx_amount = float(tx_by_id[tid]["amount"])
            already = float(already_per_tx.get(tid, 0.0))
            remaining = round(tx_amount - already, 2)
            if remaining <= 0:
                raise HTTPException(
                    409,
                    f"Ese egreso ya fue reembolsado anteriormente ({tx_by_id[tid].get('description','')}).",
                )
            requested = float(partials_in.get(tid, remaining))
            if requested <= 0:
                continue
            if requested > remaining + 0.005:
                raise HTTPException(
                    409,
                    f"El monto ({requested:.2f}) excede el saldo pendiente ({remaining:.2f}) del egreso '{tx_by_id[tid].get('description','')}'.",
                )
            partials_out[tid] = round(requested, 2)

        if not partials_out:
            raise HTTPException(409, "No se aplicó ningún monto a los egresos seleccionados.")
        doc["source_transaction_ids"] = list(partials_out.keys())
        doc["partials"] = partials_out
    else:
        doc["source_transaction_ids"] = []
        doc["partials"] = None

    doc["id"] = str(uuid.uuid4())
    stamp_create(doc, user)
    await db.reimbursements.insert_one(doc.copy())
    await log_audit("create", "reimbursement", doc["id"], user, doc.get("description", ""))
    doc.pop("_id", None)
    return ReimbursementOut(**doc)

@api.get("/reimbursements", response_model=List[ReimbursementOut])
async def list_reimbursements(partner_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    q = {}
    if partner_id: q["partner_id"] = partner_id
    docs = await db.reimbursements.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return [ReimbursementOut(**d) for d in docs]

@api.delete("/reimbursements/{rb_id}")
async def delete_reimbursement(rb_id: str, user: dict = Depends(get_current_user)):
    doc = await db.reimbursements.find_one({"id": rb_id}, {"_id": 0})
    await db.reimbursements.delete_one({"id": rb_id})
    if doc:
        await log_audit("delete", "reimbursement", rb_id, user, doc.get("description", ""))
    return {"ok": True}

@api.get("/partners/{partner_id}/pending-personal-expenses")
async def pending_personal_expenses(partner_id: str, _: dict = Depends(get_current_user)):
    """Returns personal expenses by partner with their remaining un-reimbursed amount."""
    txs = await db.transactions.find(
        {"partner_id": partner_id, "type": "expense", "paid_personally": True},
        {"_id": 0},
    ).sort("date", -1).to_list(2000)
    reimbursed_map = await _reimbursed_amount_by_tx()
    out = []
    for t in txs:
        paid = float(reimbursed_map.get(t["id"], 0.0))
        amt = float(t.get("amount") or 0)
        remaining = round(amt - paid, 2)
        out.append({
            **t,
            "reimbursed_amount": round(paid, 2),
            "remaining_balance": remaining,
            "reimbursed": remaining <= 0.005,
        })
    return out

# ---------- Dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    project_id: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    tx_q = {}
    div_q = {}
    rb_q = {}
    if date_from:
        tx_q.setdefault("date", {})["$gte"] = date_from
        div_q.setdefault("date", {})["$gte"] = date_from
        rb_q.setdefault("date", {})["$gte"] = date_from
    if date_to:
        tx_q.setdefault("date", {})["$lte"] = date_to
        div_q.setdefault("date", {})["$lte"] = date_to
        rb_q.setdefault("date", {})["$lte"] = date_to
    if project_id:
        tx_q["project_id"] = project_id
    txs = await db.transactions.find(tx_q, {"_id": 0}).to_list(10000)
    divs = await db.dividends.find(div_q, {"_id": 0}).to_list(2000)
    rbs = await db.reimbursements.find(rb_q, {"_id": 0}).to_list(2000)
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    net_balance = total_income - total_expenses

    # Cash/Transfer balances: include income, exclude expenses paid personally
    # (those didn't move company cash), subtract dividends and reimbursements (cash outflows).
    def sum_company(filter_fn):
        return sum(t["amount"] for t in txs if filter_fn(t))

    cash_in = sum_company(lambda t: t["type"] == "income" and t["payment_method"] == "cash")
    cash_out = sum_company(lambda t: t["type"] == "expense" and t["payment_method"] == "cash" and not t.get("paid_personally"))
    transfer_in = sum_company(lambda t: t["type"] == "income" and t["payment_method"] == "transfer")
    transfer_out = sum_company(lambda t: t["type"] == "expense" and t["payment_method"] == "transfer" and not t.get("paid_personally"))

    # Gross by payment method (used for breakdown bars under each card)
    cash_income_all = cash_in
    cash_expense_all = sum_company(lambda t: t["type"] == "expense" and t["payment_method"] == "cash")
    transfer_income_all = transfer_in
    transfer_expense_all = sum_company(lambda t: t["type"] == "expense" and t["payment_method"] == "transfer")

    cash_divs = sum(d["amount"] for d in divs if d.get("payment_method", "transfer") == "cash")
    transfer_divs = sum(d["amount"] for d in divs if d.get("payment_method", "transfer") == "transfer")
    cash_rbs = sum(r["amount"] for r in rbs if r.get("payment_method", "transfer") == "cash")
    transfer_rbs = sum(r["amount"] for r in rbs if r.get("payment_method", "transfer") == "transfer")
    total_dividends = sum(d["amount"] for d in divs)

    cash_balance = cash_in - cash_out - cash_divs - cash_rbs
    transfer_balance = transfer_in - transfer_out - transfer_divs - transfer_rbs

    # Real net balance = gross profit minus partner withdrawals (matches Portal's "available to distribute")
    real_net_balance = net_balance - total_dividends

    # Monthly trend (last 6 months)
    trend = {}
    for t in txs:
        key = t["date"][:7]  # YYYY-MM
        if key not in trend:
            trend[key] = {"month": key, "income": 0, "expenses": 0}
        if t["type"] == "income":
            trend[key]["income"] += t["amount"]
        else:
            trend[key]["expenses"] += t["amount"]
    trend_list = sorted(trend.values(), key=lambda x: x["month"])[-6:]

    # Projects count
    in_prog = await db.projects.count_documents({"status": "in_progress"})
    completed = await db.projects.count_documents({"status": "completed"})

    # Recent transactions
    recent = sorted(txs, key=lambda x: x.get("created_at", ""), reverse=True)[:6]

    # Per-partner reimbursements totals (for dashboard widget)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(50)
    users.sort(key=lambda d: d.get("order", 99))
    by_partner = []
    for u in users:
        pid = u["id"]
        rb_total = sum(r["amount"] for r in rbs if r["partner_id"] == pid)
        div_total = sum(d["amount"] for d in divs if d["partner_id"] == pid)
        by_partner.append({
            "id": pid,
            "name": u["name"],
            "color": u.get("color", "#002FA7"),
            "avatar_url": u.get("avatar_url"),
            "reimbursements_total": rb_total,
            "dividends_total": div_total,
        })

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_balance": net_balance,
        "real_net_balance": real_net_balance,
        "total_dividends_withdrawn": total_dividends,
        "cash_income": cash_income_all,
        "transfer_income": transfer_income_all,
        "cash_expense": cash_expense_all,
        "transfer_expense": transfer_expense_all,
        "cash_balance": cash_balance,
        "transfer_balance": transfer_balance,
        "projects_in_progress": in_prog,
        "projects_completed": completed,
        "trend": trend_list,
        "recent_transactions": recent,
        "by_partner": by_partner,
    }

# ---------- Partner Portal ----------
@api.get("/partners/portal")
async def partners_portal(_: dict = Depends(get_current_user)):
    txs = await db.transactions.find({}, {"_id": 0}).to_list(10000)
    divs = await db.dividends.find({}, {"_id": 0}).to_list(2000)
    rbs = await db.reimbursements.find({}, {"_id": 0}).to_list(2000)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(50)
    users.sort(key=lambda d: d.get("order", 99))

    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    net_balance = total_income - total_expenses
    share_pct = 1 / 3
    per_partner_share = net_balance * share_pct
    total_dividends = sum(d["amount"] for d in divs)
    total_reimbursements = sum(r["amount"] for r in rbs)
    available_to_distribute = net_balance - total_dividends

    # Load alert settings (defaults if not set)
    alert_doc = await db.settings_loan_alerts.find_one({"key": "default"}, {"_id": 0}) or {}
    threshold_amount = float(alert_doc.get("threshold_amount", 5000.0))
    threshold_days = int(alert_doc.get("threshold_days", 30))

    # Build per-tx reimbursed amount (handles partials + legacy)
    reimbursed_map = await _reimbursed_amount_by_tx()
    today = datetime.now(timezone.utc).date()

    partners_data = []
    for u in users:
        pid = u["id"]
        personal_txs = [
            t for t in txs
            if t["partner_id"] == pid and t.get("paid_personally") and t["type"] == "expense"
        ]
        personal_total = sum(float(t["amount"]) for t in personal_txs)
        # Partials-aware reimbursed_total: cap per-tx at its own amount
        reimbursed_per_partner = 0.0
        partner_alerts = []
        for t in personal_txs:
            paid = float(reimbursed_map.get(t["id"], 0.0))
            amt = float(t["amount"])
            applied = min(paid, amt)
            reimbursed_per_partner += applied
            remaining = round(amt - applied, 2)
            if remaining > 0.005:
                # compute age in days
                try:
                    d = datetime.fromisoformat(t["date"]).date() if "T" in t["date"] else datetime.strptime(t["date"], "%Y-%m-%d").date()
                except Exception:
                    d = today
                days_old = max(0, (today - d).days)
                exceeds_amount = remaining >= threshold_amount
                exceeds_days = days_old >= threshold_days
                if exceeds_amount or exceeds_days:
                    severity = "critical" if (exceeds_amount and exceeds_days) else "warning"
                    partner_alerts.append({
                        "tx_id": t["id"],
                        "description": t.get("description", ""),
                        "amount": amt,
                        "remaining": remaining,
                        "days_old": days_old,
                        "date": t["date"],
                        "severity": severity,
                        "exceeds_amount": exceeds_amount,
                        "exceeds_days": exceeds_days,
                    })
        outstanding = round(personal_total - reimbursed_per_partner, 2)
        cash_reimbursed = sum(float(r["amount"]) for r in rbs if r["partner_id"] == pid)
        dividends_withdrawn = sum(float(d["amount"]) for d in divs if d["partner_id"] == pid)
        available = per_partner_share + outstanding - dividends_withdrawn
        # Sort alerts: critical first, then by remaining desc
        partner_alerts.sort(key=lambda a: (0 if a["severity"] == "critical" else 1, -a["remaining"]))
        partners_data.append({
            "id": pid,
            "name": u["name"],
            "email": u["email"],
            "color": u.get("color", "#002FA7"),
            "avatar_url": u.get("avatar_url"),
            "share_percent": share_pct * 100,
            "profit_share": per_partner_share,
            "personal_payments_total": personal_total,
            "reimbursed_total": round(reimbursed_per_partner, 2),
            "cash_reimbursed_total": round(cash_reimbursed, 2),
            "personal_payments_owed": outstanding,
            "dividends_withdrawn": dividends_withdrawn,
            "available_to_collect": available,
            "alerts": partner_alerts,
            "alerts_count": len(partner_alerts),
            "has_critical_alert": any(a["severity"] == "critical" for a in partner_alerts),
        })

    return {
        "net_balance": net_balance,
        "per_partner_share": per_partner_share,
        "total_dividends_withdrawn": total_dividends,
        "total_reimbursements_paid": total_reimbursements,
        "available_to_distribute": available_to_distribute,
        "alert_settings": {
            "threshold_amount": threshold_amount,
            "threshold_days": threshold_days,
        },
        "partners": partners_data,
    }

# ---------- Loan alert settings ----------
@api.get("/settings/loan-alerts", response_model=LoanAlertSettings)
async def get_loan_alerts(_: dict = Depends(get_current_user)):
    doc = await db.settings_loan_alerts.find_one({"key": "default"}, {"_id": 0}) or {}
    return LoanAlertSettings(
        threshold_amount=float(doc.get("threshold_amount", 5000.0)),
        threshold_days=int(doc.get("threshold_days", 30)),
    )

@api.put("/settings/loan-alerts", response_model=LoanAlertSettings)
async def set_loan_alerts(payload: LoanAlertSettings, user: dict = Depends(get_current_user)):
    if payload.threshold_amount < 0 or payload.threshold_days < 0:
        raise HTTPException(400, "Los umbrales deben ser positivos.")
    await db.settings_loan_alerts.update_one(
        {"key": "default"},
        {"$set": {
            "key": "default",
            "threshold_amount": float(payload.threshold_amount),
            "threshold_days": int(payload.threshold_days),
        }},
        upsert=True,
    )
    await log_audit("update", "settings", "loan-alerts", user,
                    f"umbral=${payload.threshold_amount:.2f}/{payload.threshold_days}d")
    return payload

# ---------- Hub de Socios ----------
@api.get("/hub", response_model=List[HubItemOut])
async def list_hub(
    type: Optional[str] = None,
    q: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query: dict = {}
    if type:
        query["type"] = type
    if q:
        regex = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"title": regex}, {"content": regex}, {"tags": regex}, {"url": regex}, {"username": regex}]
    docs = await db.hub_items.find(query, {"_id": 0}).to_list(5000)
    docs.sort(key=lambda d: (0 if d.get("pinned") else 1, -(datetime.fromisoformat(d["created_at"]).timestamp() if d.get("created_at") else 0)))
    return [HubItemOut(**d) for d in docs]

@api.post("/hub", response_model=HubItemOut)
async def create_hub(payload: HubItemIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["comments"] = []
    stamp_create(doc, user)
    await db.hub_items.insert_one(doc.copy())
    await log_audit("create", "hub", doc["id"], user, doc.get("title", ""))
    doc.pop("_id", None)
    return HubItemOut(**doc)

@api.put("/hub/{item_id}", response_model=HubItemOut)
async def update_hub(item_id: str, payload: HubItemIn, user: dict = Depends(get_current_user)):
    existing = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Item no encontrado")
    upd = payload.model_dump()
    stamp_update(upd, user)
    await db.hub_items.update_one({"id": item_id}, {"$set": upd})
    await log_audit("update", "hub", item_id, user, upd.get("title", ""))
    doc = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    return HubItemOut(**doc)

@api.delete("/hub/{item_id}")
async def delete_hub(item_id: str, user: dict = Depends(get_current_user)):
    doc = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    await db.hub_items.delete_one({"id": item_id})
    if doc:
        await log_audit("delete", "hub", item_id, user, doc.get("title", ""))
    return {"ok": True}

@api.post("/hub/{item_id}/comments", response_model=HubItemOut)
async def add_hub_comment(item_id: str, payload: HubCommentIn, user: dict = Depends(get_current_user)):
    item = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "El comentario no puede estar vacío")
    comment = {
        "id": str(uuid.uuid4()),
        "text": text[:2000],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_id": user["id"],
        "created_by_name": user.get("name", ""),
    }
    await db.hub_items.update_one({"id": item_id}, {"$push": {"comments": comment}})
    await log_audit("create", "hub_comment", item_id, user, text[:80])
    item = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    return HubItemOut(**item)

@api.delete("/hub/{item_id}/comments/{comment_id}", response_model=HubItemOut)
async def delete_hub_comment(item_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    item = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item no encontrado")
    comment = next((c for c in (item.get("comments") or []) if c.get("id") == comment_id), None)
    if not comment:
        raise HTTPException(404, "Comentario no encontrado")
    if comment.get("created_by_id") != user["id"]:
        raise HTTPException(403, "Solo el autor del comentario puede eliminarlo")
    await db.hub_items.update_one({"id": item_id}, {"$pull": {"comments": {"id": comment_id}}})
    await log_audit("delete", "hub_comment", item_id, user, comment.get("text", "")[:80])
    item = await db.hub_items.find_one({"id": item_id}, {"_id": 0})
    return HubItemOut(**item)

# ---------- Files ----------
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(413, "Archivo demasiado grande (máx 10MB)")
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME:
        raise HTTPException(415, "Tipo de archivo no permitido. Usa JPG, PNG, WEBP o PDF.")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    result = put_object(path, data, content_type)
    record = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_id": user["id"],
        "created_by_name": user["name"],
    }
    await db.files.insert_one(record.copy())
    await log_audit("create", "file", file_id, user, file.filename or "")
    record.pop("_id", None)
    return record

@api.get("/files/{file_id}")
async def get_file_meta(file_id: str, _: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Archivo no encontrado")
    return rec

@api.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    authorization: Optional[str] = Header(None),
    auth: Optional[str] = Query(None),
):
    # Custom auth: accept either header or query param
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        u = await db.users.find_one({"id": payload["sub"]})
        if not u:
            raise HTTPException(401, "Usuario no encontrado")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Archivo no encontrado")
    data, content_type = get_object(rec["storage_path"])
    return StreamingResponse(
        io.BytesIO(data),
        media_type=rec.get("content_type", content_type),
        headers={"Content-Disposition": f'inline; filename="{rec.get("original_filename", "archivo")}"'},
    )

@api.delete("/files/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id})
    if not rec:
        raise HTTPException(404, "Archivo no encontrado")
    await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    await log_audit("delete", "file", file_id, user, rec.get("original_filename", ""))
    return {"ok": True}

# ---------- Audit log ----------
@api.get("/audit-logs")
async def list_audit_logs(
    entity_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 200,
    _: dict = Depends(get_current_user),
):
    q = {}
    if entity_type: q["entity_type"] = entity_type
    if actor_id: q["actor_id"] = actor_id
    if action: q["action"] = action
    if date_from or date_to:
        ts = {}
        if date_from: ts["$gte"] = f"{date_from}T00:00:00+00:00"
        if date_to: ts["$lte"] = f"{date_to}T23:59:59+00:00"
        q["timestamp"] = ts
    docs = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(min(limit, 1000))
    return docs

# ---------- Exports ----------
from exports import to_xlsx, to_pdf, fmt_currency, fmt_date_short

PAYMENT_LABEL = {"cash": "Efectivo", "transfer": "Transferencia"}
TX_TYPE_LABEL = {"income": "Ingreso", "expense": "Egreso"}
CATEGORY_LABEL = {
    "general": "General", "taxes": "Impuestos", "accountant": "Contador",
    "travel": "Viáticos", "materials": "Materiales", "labor": "Mano de obra",
    "services": "Servicios", "other": "Otros",
}
STATUS_LABEL_ES = {
    "in_progress": "En progreso",
    "started": "Iniciado",
    "paid": "Pagado",
    "with_debt": "Con adeudo",
    "completed": "Finalizado",
}
ACTION_LABEL_ES = {"create": "Creación", "update": "Edición", "delete": "Eliminación"}
ENTITY_LABEL_ES = {
    "transaction": "Transacción", "project": "Proyecto", "dividend": "Retiro",
    "reimbursement": "Reembolso", "file": "Archivo", "client": "Cliente", "provider": "Proveedor",
}


def _export_response(content: bytes, filename: str, fmt: str) -> Response:
    media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if fmt == "xlsx" else "application/pdf"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}.{fmt}"'},
    )


async def _resolve_lookup_maps():
    partners = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    projects = await db.projects.find({}, {"_id": 0}).to_list(2000)
    clients = await db.clients.find({}, {"_id": 0}).to_list(5000)
    providers = await db.providers.find({}, {"_id": 0}).to_list(5000)
    return (
        {p["id"]: p.get("name", "") for p in partners},
        {p["id"]: p.get("name", "") for p in projects},
        {c["id"]: c.get("name", "") for c in clients},
        {p["id"]: p.get("name", "") for p in providers},
    )


@api.get("/exports/transactions")
async def export_transactions(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    type: Optional[str] = None,
    partner_id: Optional[str] = None,
    project_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    q = {}
    if type: q["type"] = type
    if partner_id: q["partner_id"] = partner_id
    if project_id: q["project_id"] = project_id
    if payment_method: q["payment_method"] = payment_method
    txs = await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(10000)
    partners_m, projects_m, clients_m, providers_m = await _resolve_lookup_maps()
    headers = ["Fecha", "Tipo", "Descripción", "Cliente/Proveedor", "Proyecto", "Socio", "Método", "Categoría", "Pago personal", "Monto"]
    rows = []
    for t in txs:
        contact = clients_m.get(t.get("client_id")) if t["type"] == "income" else providers_m.get(t.get("provider_id"))
        rows.append([
            fmt_date_short(t.get("date")),
            TX_TYPE_LABEL.get(t["type"], t["type"]),
            t.get("description", ""),
            contact or t.get("counterparty", "") or "",
            projects_m.get(t.get("project_id"), ""),
            partners_m.get(t.get("partner_id"), ""),
            PAYMENT_LABEL.get(t.get("payment_method"), ""),
            CATEGORY_LABEL.get(t.get("category"), ""),
            "Sí" if t.get("paid_personally") else "",
            fmt_currency(t.get("amount", 0)),
        ])
    title = "Ingresos y Egresos"
    content = to_xlsx(title, headers, rows) if format == "xlsx" else to_pdf(title, headers, rows)
    return _export_response(content, f"ingresos_egresos_{datetime.now().strftime('%Y%m%d')}", format)


@api.get("/exports/projects")
async def export_projects(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    q: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {}
    if status: query["status"] = status
    if client_id: query["client_id"] = client_id
    if q: query["name"] = {"$regex": re.escape(q), "$options": "i"}
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    txs = await db.transactions.find({}, {"_id": 0}).to_list(20000)
    _, _, clients_m, _ = await _resolve_lookup_maps()

    # Precompute pnl
    income_by = {}
    expense_by = {}
    for t in txs:
        pid = t.get("project_id")
        if not pid: continue
        if t["type"] == "income":
            income_by[pid] = income_by.get(pid, 0) + t["amount"]
        else:
            expense_by[pid] = expense_by.get(pid, 0) + t["amount"]

    # Build dynamic status labels from settings catalog
    cat = await db.settings_catalogs.find_one({"key": "project_statuses"}, {"_id": 0, "items": 1})
    status_labels = {it["value"]: it["label"] for it in (cat or {}).get("items", [])} if cat else dict(STATUS_LABEL_ES)
    for k, v in STATUS_LABEL_ES.items():
        status_labels.setdefault(k, v)

    headers = ["Proyecto", "Cliente", "Estado", "Inicio", "Cierre", "Ingresos", "Egresos", "Utilidad"]
    rows = []
    for p in projects:
        inc = income_by.get(p["id"], 0)
        exp = expense_by.get(p["id"], 0)
        rows.append([
            p.get("name", ""),
            clients_m.get(p.get("client_id"), "") or p.get("client_name", ""),
            status_labels.get(p.get("status"), p.get("status", "")),
            fmt_date_short(p.get("start_date")),
            fmt_date_short(p.get("end_date")),
            fmt_currency(inc),
            fmt_currency(exp),
            fmt_currency(inc - exp),
        ])
    title = "Proyectos"
    content = to_xlsx(title, headers, rows) if format == "xlsx" else to_pdf(title, headers, rows)
    return _export_response(content, f"proyectos_{datetime.now().strftime('%Y%m%d')}", format)


@api.get("/exports/clients")
async def export_clients(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    q: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {"name": {"$regex": re.escape(q), "$options": "i"}} if q else {}
    docs = await db.clients.find(query, {"_id": 0}).sort("name", 1).to_list(5000)
    headers = ["Nombre", "RFC", "Contacto", "Email", "Teléfono", "Notas"]
    rows = [[d.get("name", ""), d.get("rfc", ""), d.get("contact_name", ""), d.get("email", ""), d.get("phone", ""), d.get("notes", "")] for d in docs]
    title = "Clientes"
    content = to_xlsx(title, headers, rows) if format == "xlsx" else to_pdf(title, headers, rows)
    return _export_response(content, f"clientes_{datetime.now().strftime('%Y%m%d')}", format)


@api.get("/exports/providers")
async def export_providers(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    q: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {"name": {"$regex": re.escape(q), "$options": "i"}} if q else {}
    docs = await db.providers.find(query, {"_id": 0}).sort("name", 1).to_list(5000)
    headers = ["Nombre", "RFC", "Categoría", "Contacto", "Email", "Teléfono", "Notas"]
    rows = [[
        d.get("name", ""), d.get("rfc", ""), CATEGORY_LABEL.get(d.get("category", "general"), d.get("category", "")),
        d.get("contact_name", ""), d.get("email", ""), d.get("phone", ""), d.get("notes", ""),
    ] for d in docs]
    title = "Proveedores"
    content = to_xlsx(title, headers, rows) if format == "xlsx" else to_pdf(title, headers, rows)
    return _export_response(content, f"proveedores_{datetime.now().strftime('%Y%m%d')}", format)


@api.get("/exports/audit")
async def export_audit(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    entity_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {}
    if entity_type: query["entity_type"] = entity_type
    if actor_id: query["actor_id"] = actor_id
    if action: query["action"] = action
    if date_from or date_to:
        ts = {}
        if date_from: ts["$gte"] = f"{date_from}T00:00:00+00:00"
        if date_to: ts["$lte"] = f"{date_to}T23:59:59+00:00"
        query["timestamp"] = ts
    docs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(5000)
    headers = ["Fecha", "Acción", "Módulo", "Socio", "Referencia"]
    rows = [[
        fmt_date_short(d.get("timestamp")),
        ACTION_LABEL_ES.get(d.get("action"), d.get("action", "")),
        ENTITY_LABEL_ES.get(d.get("entity_type"), d.get("entity_type", "")),
        d.get("actor_name", ""),
        d.get("label", ""),
    ] for d in docs]
    title = "Auditoría"
    content = to_xlsx(title, headers, rows) if format == "xlsx" else to_pdf(title, headers, rows)
    return _export_response(content, f"auditoria_{datetime.now().strftime('%Y%m%d')}", format)


@api.get("/exports/partners")
async def export_partners(
    format: str = Query("xlsx", regex="^(xlsx|pdf)$"),
    partner_id: Optional[str] = None,
    kind: Optional[str] = Query(None, regex="^(dividends|reimbursements|all)$"),
    _: dict = Depends(get_current_user),
):
    """Exports partner movements: dividends, reimbursements, or both (default both)."""
    q = {}
    if partner_id: q["partner_id"] = partner_id
    partners_m, _, _, _ = await _resolve_lookup_maps()
    rows: list = []
    if not kind or kind in ("dividends", "all"):
        divs = await db.dividends.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
        for d in divs:
            rows.append([
                fmt_date_short(d.get("date")),
                "Retiro",
                partners_m.get(d.get("partner_id"), ""),
                PAYMENT_LABEL.get(d.get("payment_method", "transfer"), ""),
                d.get("description", ""),
                fmt_currency(d.get("amount", 0)),
            ])
    if not kind or kind in ("reimbursements", "all"):
        rbs = await db.reimbursements.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
        for r in rbs:
            rows.append([
                fmt_date_short(r.get("date")),
                "Reembolso",
                partners_m.get(r.get("partner_id"), ""),
                PAYMENT_LABEL.get(r.get("payment_method", "transfer"), ""),
                r.get("description", ""),
                fmt_currency(r.get("amount", 0)),
            ])
    rows.sort(key=lambda r: r[0], reverse=True)
    headers = ["Fecha", "Tipo", "Socio", "Método", "Descripción", "Monto"]
    title = "Movimientos de socios"
    content = to_xlsx(title, headers, rows) if format == "xlsx" else to_pdf(title, headers, rows)
    return _export_response(content, f"socios_{datetime.now().strftime('%Y%m%d')}", format)


# Custom auth helper for export downloads via <a href> query param
async def _auth_from_query_or_header(authorization: Optional[str], auth: Optional[str]) -> dict:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(401, "Usuario no encontrado")
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")

# ---------- Health ----------
@api.get("/")
async def root():
    return {"message": "Admin Control API", "ok": True}

# ---------- Seed ----------
PARTNER_COLORS = ["#002FA7", "#10B981", "#F59E0B"]
PARTNER_AVATARS = [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3OTkwNzc3Nnww&ixlib=rb-4.1.0&q=85",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3OTkwNzc3Nnww&ixlib=rb-4.1.0&q=85",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3OTkwNzc3Nnww&ixlib=rb-4.1.0&q=85",
]

# Old demo accounts to clean up (one-time migration)
LEGACY_EMAILS = ["carlos@socios.com", "ana@socios.com", "diego@socios.com"]

async def seed_partners():
    # Remove legacy demo users (clean migration)
    for legacy_email in LEGACY_EMAILS:
        await db.users.delete_one({"email": legacy_email})

    for i in range(3):
        email = os.environ.get(f"PARTNER_{i+1}_EMAIL", f"partner{i+1}@socios.com").lower()
        password = os.environ.get(f"PARTNER_{i+1}_PASSWORD", "Bienvenido2026!")
        name = os.environ.get(f"PARTNER_{i+1}_NAME", f"Socio {i+1}")
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email,
                "name": name,
                "color": PARTNER_COLORS[i],
                "avatar_url": PARTNER_AVATARS[i],
                "order": i + 1,
                "role": "partner",
                "password_hash": hash_password(password),
                "must_change_password": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            # Keep existing user but ensure metadata is current (don't touch password)
            await db.users.update_one(
                {"email": email},
                {"$set": {
                    "name": name,
                    "color": PARTNER_COLORS[i],
                    "avatar_url": PARTNER_AVATARS[i],
                    "order": i + 1,
                    "role": "partner",
                }},
            )

# ---------- Settings catalogs ----------
DEFAULT_CATALOGS: dict = {
    "income_categories": [
        {"value": "general", "label": "General"},
        {"value": "services", "label": "Servicios"},
        {"value": "sales", "label": "Venta"},
        {"value": "installation", "label": "Instalación"},
        {"value": "consulting", "label": "Consultoría"},
        {"value": "other", "label": "Otros"},
    ],
    "expense_categories": [
        {"value": "general", "label": "General"},
        {"value": "taxes", "label": "Impuestos"},
        {"value": "accountant", "label": "Contador"},
        {"value": "travel", "label": "Viáticos"},
        {"value": "materials", "label": "Materiales"},
        {"value": "labor", "label": "Mano de obra"},
        {"value": "services", "label": "Servicios"},
        {"value": "other", "label": "Otros"},
    ],
    "payment_methods": [
        {"value": "cash", "label": "Efectivo"},
        {"value": "transfer", "label": "Transferencia"},
    ],
    "project_statuses": [
        {"value": "in_progress", "label": "En progreso", "color": "blue"},
        {"value": "started", "label": "Iniciado", "color": "indigo"},
        {"value": "paid", "label": "Pagado", "color": "emerald"},
        {"value": "with_debt", "label": "Con adeudo", "color": "amber"},
        {"value": "completed", "label": "Finalizado", "color": "slate"},
    ],
}

class CatalogItem(BaseModel):
    value: str
    label: str
    color: Optional[str] = None  # optional palette key for items that support it

class SettingsCatalogIn(BaseModel):
    items: List[CatalogItem]

class SettingsCatalogOut(BaseModel):
    key: str
    items: List[CatalogItem]
    label: str

CATALOG_LABELS = {
    "income_categories": "Categorías de Ingresos",
    "expense_categories": "Categorías de Egresos",
    "payment_methods": "Métodos de Pago",
    "project_statuses": "Estatus de Proyectos",
}

async def seed_settings_catalogs():
    for key, items in DEFAULT_CATALOGS.items():
        existing = await db.settings_catalogs.find_one({"key": key}, {"_id": 0, "key": 1})
        if not existing:
            await db.settings_catalogs.insert_one({"key": key, "items": items})

@api.get("/settings/catalogs", response_model=List[SettingsCatalogOut])
async def list_catalogs(_: dict = Depends(get_current_user)):
    docs = await db.settings_catalogs.find({}, {"_id": 0}).to_list(50)
    by_key = {d["key"]: d for d in docs}
    result = []
    for key, label in CATALOG_LABELS.items():
        d = by_key.get(key) or {"key": key, "items": DEFAULT_CATALOGS.get(key, [])}
        result.append(SettingsCatalogOut(key=key, items=d.get("items", []), label=label))
    return result

@api.get("/settings/catalogs/{key}", response_model=SettingsCatalogOut)
async def get_catalog(key: str, _: dict = Depends(get_current_user)):
    if key not in CATALOG_LABELS:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")
    d = await db.settings_catalogs.find_one({"key": key}, {"_id": 0})
    items = (d or {}).get("items") or DEFAULT_CATALOGS.get(key, [])
    return SettingsCatalogOut(key=key, items=items, label=CATALOG_LABELS[key])

@api.put("/settings/catalogs/{key}", response_model=SettingsCatalogOut)
async def update_catalog(key: str, payload: SettingsCatalogIn, user: dict = Depends(get_current_user)):
    if key not in CATALOG_LABELS:
        raise HTTPException(status_code=404, detail="Catálogo no encontrado")
    items = [i.model_dump() for i in payload.items]
    values = [i["value"] for i in items]
    if len(values) != len(set(values)):
        raise HTTPException(status_code=400, detail="Los identificadores deben ser únicos")
    if not items:
        raise HTTPException(status_code=400, detail="El catálogo no puede estar vacío")
    await db.settings_catalogs.update_one(
        {"key": key}, {"$set": {"key": key, "items": items}}, upsert=True,
    )
    await log_audit("update", "settings", key, user, f"Catálogo {CATALOG_LABELS[key]}")
    return SettingsCatalogOut(key=key, items=items, label=CATALOG_LABELS[key])



@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.transactions.create_index("date")
    await db.transactions.create_index("partner_id")
    await db.transactions.create_index("project_id")
    await db.projects.create_index("status")
    await db.projects.create_index("code")
    await db.audit_logs.create_index([("timestamp", -1)])
    await db.clients.create_index("name")
    await db.providers.create_index("name")
    await db.settings_catalogs.create_index("key", unique=True)
    await seed_partners()
    await seed_settings_catalogs()
    # Backfill project codes for any existing project without one
    cursor = db.projects.find({"$or": [{"code": {"$exists": False}}, {"code": None}]}, {"_id": 0, "id": 1, "created_at": 1})
    legacy = await cursor.to_list(10000)
    legacy.sort(key=lambda p: p.get("created_at", ""))
    for proj in legacy:
        code = await _next_project_code()
        await db.projects.update_one({"id": proj["id"]}, {"$set": {"code": code}})
    init_storage()

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
