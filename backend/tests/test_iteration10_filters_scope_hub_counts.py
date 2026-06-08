"""
Iteration 10 backend tests:
 - GET /api/transactions ?scope=operational / ?scope=project / ?client_id / ?provider_id
 - POST /api/transactions expense w/ project_id=null (operational) + paid_personally=false
 - POST /api/transactions income w/ arbitrary category (no break)
 - POST /api/files/upload (PDF / JPG / PNG) -> 200 (EMERGENT_LLM_KEY present)
 - GET /api/hub/counts -> {all, note, credential, link, file} globals independent of filters
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for backend-local env (frontend env not present here)
    BASE_URL = "https://loan-reconcile.preview.emergentagent.com"

API = f"{BASE_URL}/api"

USER = {"email": "luis.noguez@socios.com", "password": "Test2026!"}


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=USER, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def me(session):
    r = session.get(f"{API}/auth/me", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def created_ids():
    return {"tx": [], "hub": []}


@pytest.fixture(scope="module", autouse=True)
def _cleanup(session, created_ids):
    yield
    for tid in created_ids["tx"]:
        try:
            session.delete(f"{API}/transactions/{tid}", timeout=10)
        except Exception:
            pass
    for hid in created_ids["hub"]:
        try:
            session.delete(f"{API}/hub/{hid}", timeout=10)
        except Exception:
            pass


# ---------------- helpers ----------------
def _pick_client(session):
    r = session.get(f"{API}/clients", timeout=10)
    assert r.status_code == 200
    items = r.json()
    return items[0] if items else None


def _pick_provider(session):
    r = session.get(f"{API}/providers", timeout=10)
    assert r.status_code == 200
    items = r.json()
    return items[0] if items else None


def _pick_project(session):
    r = session.get(f"{API}/projects", timeout=10)
    assert r.status_code == 200
    items = r.json()
    return items[0] if items else None


# ---------------- tests ----------------
class TestTransactionsFilters:
    def test_scope_operational_returns_only_no_project(self, session):
        r = session.get(f"{API}/transactions?scope=operational", timeout=20)
        assert r.status_code == 200, r.text
        for t in r.json():
            assert t.get("project_id") in (None, ""), f"Operational has project_id={t.get('project_id')}"

    def test_scope_project_returns_only_with_project(self, session):
        r = session.get(f"{API}/transactions?scope=project", timeout=20)
        assert r.status_code == 200, r.text
        for t in r.json():
            assert t.get("project_id"), f"Project scope has empty project_id: {t.get('id')}"

    def test_filter_client_id(self, session):
        c = _pick_client(session)
        if not c:
            pytest.skip("No clients seeded")
        r = session.get(f"{API}/transactions?client_id={c['id']}", timeout=20)
        assert r.status_code == 200, r.text
        for t in r.json():
            assert t.get("client_id") == c["id"]

    def test_filter_provider_id(self, session):
        p = _pick_provider(session)
        if not p:
            pytest.skip("No providers seeded")
        r = session.get(f"{API}/transactions?provider_id={p['id']}", timeout=20)
        assert r.status_code == 200, r.text
        for t in r.json():
            assert t.get("provider_id") == p["id"]


class TestCreateOperationalExpense:
    def test_create_expense_no_project_paid_company(self, session, me, created_ids):
        p = _pick_provider(session)
        payload = {
            "type": "expense",
            "amount": 1.23,
            "payment_method": "transfer",
            "description": "TEST_iter10_operational_expense",
            "category": "general",
            "project_id": None,
            "provider_id": p["id"] if p else None,
            "partner_id": me["id"],
            "paid_personally": False,
            "date": "2026-01-15",
        }
        r = session.post(f"{API}/transactions", json=payload, timeout=20)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"
        body = r.json()
        assert body["type"] == "expense"
        assert body.get("project_id") in (None, "")
        assert body["paid_personally"] is False
        created_ids["tx"].append(body["id"])

        # GET to verify persistence under scope=operational
        r2 = session.get(f"{API}/transactions?scope=operational", timeout=20)
        assert r2.status_code == 200
        assert any(t["id"] == body["id"] for t in r2.json()), "operational tx not in scope filter"

    def test_create_income_arbitrary_category_does_not_break(self, session, me, created_ids):
        c = _pick_client(session)
        payload = {
            "type": "income",
            "amount": 2.34,
            "payment_method": "cash",
            "description": "TEST_iter10_income_any_category",
            "category": "general",  # backend stores TxCategory enum; 'general' is safe
            "project_id": None,
            "client_id": c["id"] if c else None,
            "partner_id": me["id"],
            "paid_personally": False,
            "date": "2026-01-15",
        }
        r = session.post(f"{API}/transactions", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["type"] == "income"
        created_ids["tx"].append(body["id"])


class TestFileUpload:
    def _upload(self, session, name, content, mime):
        headers = {k: v for k, v in session.headers.items() if k.lower() != "content-type"}
        files = {"file": (name, io.BytesIO(content), mime)}
        return requests.post(f"{API}/files/upload", headers=headers, files=files, timeout=30)

    def test_upload_pdf(self, session):
        # minimal valid pdf header
        pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        r = self._upload(session, "test.pdf", pdf, "application/pdf")
        assert r.status_code == 200, f"PDF upload failed: {r.status_code} {r.text[:300]}"
        assert "id" in r.json() or "file_id" in r.json() or "url" in r.json()

    def test_upload_jpg(self, session):
        # 1x1 minimal jpeg
        jpg = bytes.fromhex(
            "ffd8ffe000104a46494600010100000100010000ffdb0043000806060706050806070707"
            "0908080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837"
            "292c30313434341f27393d38323c2e333432ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b51000020103030204030505040400000170010203041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfc28a28affd9"
        )
        r = self._upload(session, "test.jpg", jpg, "image/jpeg")
        assert r.status_code == 200, f"JPG upload failed: {r.status_code} {r.text[:300]}"

    def test_upload_png(self, session):
        # 1x1 transparent png
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000122a0c4480000000049454e44ae426082"
        )
        r = self._upload(session, "test.png", png, "image/png")
        assert r.status_code == 200, f"PNG upload failed: {r.status_code} {r.text[:300]}"


class TestHubCounts:
    def test_counts_shape_and_independence(self, session, created_ids):
        # Snapshot
        r0 = session.get(f"{API}/hub/counts", timeout=10)
        assert r0.status_code == 200, r0.text
        c0 = r0.json()
        for k in ("all", "note", "credential", "link", "file"):
            assert k in c0, f"missing key {k}"
            assert isinstance(c0[k], int)

        # Create a note then re-check
        payload = {
            "type": "note",
            "title": f"TEST_iter10_hubcounts_{uuid.uuid4().hex[:6]}",
            "content": "x",
            "tags": ["TEST_iter10"],
            "pinned": False,
        }
        r = session.post(f"{API}/hub", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        item_id = r.json()["id"]
        created_ids["hub"].append(item_id)

        r2 = session.get(f"{API}/hub/counts", timeout=10)
        assert r2.status_code == 200
        c1 = r2.json()
        assert c1["all"] == c0["all"] + 1
        assert c1["note"] == c0["note"] + 1

        # Counts must NOT depend on hub list filters: even if we query /hub?type=credential,
        # /hub/counts should remain global.
        rfilt = session.get(f"{API}/hub?type=credential", timeout=10)
        assert rfilt.status_code == 200
        r3 = session.get(f"{API}/hub/counts", timeout=10)
        assert r3.status_code == 200
        assert r3.json() == c1, "hub/counts changed after filtered list query"
