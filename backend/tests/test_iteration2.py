"""
Iteration 2 backend tests:
- File upload/download/delete + audit + validation
- Audit logs for transactions/projects/dividends/reimbursements
- Reimbursement status decoration on transactions
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

CARLOS = {"email": "carlos@socios.com", "password": "socio123"}


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/auth/login", json=CARLOS, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "token": data["access_token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest.fixture(scope="module")
def partners(auth):
    r = requests.get(f"{API}/partners", headers=auth["headers"])
    return r.json()


# Tiny valid PNG (1x1) - signature + IHDR + IDAT + IEND
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c63f8cfc0c0c0c0000000050001a5f7f4090000000049454e44ae426082"
)


# ---------- File upload ----------
class TestFiles:
    file_id = None
    other_file_id = None

    def test_upload_png_ok(self, auth):
        files = {"file": ("test.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": auth["headers"]["Authorization"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and d["id"]
        assert d["content_type"] == "image/png"
        assert d["size"] >= len(PNG_BYTES) - 5  # storage may report length
        assert d["is_deleted"] is False
        TestFiles.file_id = d["id"]

    def test_get_metadata(self, auth):
        assert TestFiles.file_id
        r = requests.get(f"{API}/files/{TestFiles.file_id}", headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["id"] == TestFiles.file_id

    def test_download_with_query_token(self, auth):
        assert TestFiles.file_id
        r = requests.get(
            f"{API}/files/{TestFiles.file_id}/download",
            params={"auth": auth["token"]},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_download_with_bearer_header(self, auth):
        assert TestFiles.file_id
        r = requests.get(
            f"{API}/files/{TestFiles.file_id}/download",
            headers={"Authorization": f"Bearer {auth['token']}"},
            timeout=30,
        )
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_download_unauthorized(self):
        assert TestFiles.file_id
        r = requests.get(f"{API}/files/{TestFiles.file_id}/download")
        assert r.status_code == 401

    def test_reject_bad_mime(self, auth):
        files = {"file": ("evil.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": auth["headers"]["Authorization"]})
        assert r.status_code == 415

    def test_reject_too_large(self, auth):
        big = b"\x00" * (10 * 1024 * 1024 + 100)
        files = {"file": ("big.png", io.BytesIO(big), "image/png")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": auth["headers"]["Authorization"]})
        assert r.status_code == 413

    def test_soft_delete(self, auth):
        # Upload a second file then delete it
        files = {"file": ("del.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": auth["headers"]["Authorization"]})
        assert r.status_code == 200
        fid = r.json()["id"]
        r = requests.delete(f"{API}/files/{fid}", headers=auth["headers"])
        assert r.status_code == 200
        r = requests.get(f"{API}/files/{fid}", headers=auth["headers"])
        assert r.status_code == 404  # filtered by is_deleted=False
        # audit log records delete
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"], params={"entity_type": "file", "action": "delete"})
        assert any(l["entity_id"] == fid for l in r.json())


# ---------- Transactions with file + audit + stamps ----------
class TestTxWithFileAndAudit:
    def test_create_tx_with_file_id_and_stamps(self, auth, partners):
        # upload file first
        files = {"file": ("tx.png", io.BytesIO(PNG_BYTES), "image/png")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": auth["headers"]["Authorization"]})
        fid = r.json()["id"]

        carlos_id = next(p["id"] for p in partners if p["email"] == "carlos@socios.com")
        payload = {
            "type": "expense", "amount": 42.5, "payment_method": "cash",
            "description": "TEST_audit_expense", "partner_id": carlos_id,
            "date": "2026-01-15", "paid_personally": True, "file_id": fid,
        }
        r = requests.post(f"{API}/transactions", json=payload, headers=auth["headers"])
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["file_id"] == fid
        assert tx["created_by_id"] == auth["user"]["id"]
        assert tx["created_by_name"] == auth["user"]["name"]
        # reimbursement_status pending
        assert tx["reimbursement_status"] == "pending"
        tx_id = tx["id"]

        # audit create
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "transaction", "action": "create"})
        assert r.status_code == 200
        logs = r.json()
        assert any(l["entity_id"] == tx_id and l["actor_id"] == auth["user"]["id"] for l in logs)

        # update tx
        payload["amount"] = 50
        payload["description"] = "TEST_audit_expense_upd"
        r = requests.put(f"{API}/transactions/{tx_id}", json=payload, headers=auth["headers"])
        assert r.status_code == 200, r.text
        tx2 = r.json()
        assert tx2["updated_by_id"] == auth["user"]["id"]
        assert tx2["updated_at"]
        # audit update
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "transaction", "action": "update"})
        assert any(l["entity_id"] == tx_id for l in r.json())

        # GET list returns file_id
        r = requests.get(f"{API}/transactions", headers=auth["headers"])
        match = next(t for t in r.json() if t["id"] == tx_id)
        assert match["file_id"] == fid

        # delete tx
        r = requests.delete(f"{API}/transactions/{tx_id}", headers=auth["headers"])
        assert r.status_code == 200
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "transaction", "action": "delete"})
        assert any(l["entity_id"] == tx_id for l in r.json())


# ---------- Reimbursement status decoration ----------
class TestReimbursementStatus:
    def test_status_pending_then_reimbursed(self, auth, partners):
        carlos_id = next(p["id"] for p in partners if p["email"] == "carlos@socios.com")
        # personal expense -> pending
        r = requests.post(f"{API}/transactions", json={
            "type": "expense", "amount": 80, "payment_method": "cash",
            "description": "TEST_rs", "partner_id": carlos_id,
            "date": "2026-01-20", "paid_personally": True,
        }, headers=auth["headers"])
        tx_id = r.json()["id"]
        r = requests.get(f"{API}/transactions", headers=auth["headers"])
        tx = next(t for t in r.json() if t["id"] == tx_id)
        assert tx["reimbursement_status"] == "pending"

        # Non-personal expense -> null
        r = requests.post(f"{API}/transactions", json={
            "type": "expense", "amount": 10, "payment_method": "cash",
            "description": "TEST_nonpersonal", "partner_id": carlos_id,
            "date": "2026-01-21", "paid_personally": False,
        }, headers=auth["headers"])
        npid = r.json()["id"]
        r = requests.get(f"{API}/transactions", headers=auth["headers"])
        np = next(t for t in r.json() if t["id"] == npid)
        assert np["reimbursement_status"] is None

        # Income -> null
        r = requests.post(f"{API}/transactions", json={
            "type": "income", "amount": 100, "payment_method": "transfer",
            "description": "TEST_inc", "partner_id": carlos_id, "date": "2026-01-22",
        }, headers=auth["headers"])
        inc_id = r.json()["id"]
        r = requests.get(f"{API}/transactions", headers=auth["headers"])
        inc = next(t for t in r.json() if t["id"] == inc_id)
        assert inc["reimbursement_status"] is None

        # Now reimburse the first one
        r = requests.post(f"{API}/reimbursements", json={
            "partner_id": carlos_id, "amount": 80, "payment_method": "transfer",
            "description": "TEST_rb", "date": "2026-01-25",
            "source_transaction_ids": [tx_id],
        }, headers=auth["headers"])
        assert r.status_code == 200, r.text
        rb_id = r.json()["id"]

        # audit for reimbursement create
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "reimbursement", "action": "create"})
        assert any(l["entity_id"] == rb_id for l in r.json())

        # Now tx should be reimbursed
        r = requests.get(f"{API}/transactions", headers=auth["headers"])
        tx = next(t for t in r.json() if t["id"] == tx_id)
        assert tx["reimbursement_status"] == "reimbursed"

        # cleanup
        requests.delete(f"{API}/reimbursements/{rb_id}", headers=auth["headers"])
        for tid in [tx_id, npid, inc_id]:
            requests.delete(f"{API}/transactions/{tid}", headers=auth["headers"])

        # audit for reimbursement delete
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "reimbursement", "action": "delete"})
        assert any(l["entity_id"] == rb_id for l in r.json())


# ---------- Audit for projects + dividends ----------
class TestAuditOtherEntities:
    def test_project_audit_full_lifecycle(self, auth):
        r = requests.post(f"{API}/projects", json={
            "name": "TEST_AuditProj", "status": "in_progress", "start_date": "2026-01-01",
        }, headers=auth["headers"])
        pid = r.json()["id"]
        r = requests.put(f"{API}/projects/{pid}", json={
            "name": "TEST_AuditProj2", "status": "completed", "start_date": "2026-01-01",
        }, headers=auth["headers"])
        assert r.status_code == 200
        requests.delete(f"{API}/projects/{pid}", headers=auth["headers"])

        for action in ("create", "update", "delete"):
            r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                             params={"entity_type": "project", "action": action})
            assert any(l["entity_id"] == pid for l in r.json()), f"missing project {action} audit"

    def test_dividend_audit(self, auth, partners):
        carlos_id = partners[0]["id"]
        r = requests.post(f"{API}/dividends", json={
            "partner_id": carlos_id, "amount": 11, "description": "TEST_aud_div", "date": "2026-01-01"
        }, headers=auth["headers"])
        did = r.json()["id"]
        requests.delete(f"{API}/dividends/{did}", headers=auth["headers"])
        for action in ("create", "delete"):
            r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                             params={"entity_type": "dividend", "action": action})
            assert any(l["entity_id"] == did for l in r.json()), f"missing dividend {action} audit"


# ---------- Audit log endpoint ----------
class TestAuditEndpoint:
    def test_sorted_desc_and_filters(self, auth):
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"], params={"limit": 50})
        assert r.status_code == 200
        logs = r.json()
        assert isinstance(logs, list)
        # sorted desc
        ts = [l["timestamp"] for l in logs]
        assert ts == sorted(ts, reverse=True)
        # actor filter
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"actor_id": auth["user"]["id"], "limit": 20})
        assert all(l["actor_id"] == auth["user"]["id"] for l in r.json())

    def test_requires_auth(self):
        r = requests.get(f"{API}/audit-logs")
        assert r.status_code == 401
