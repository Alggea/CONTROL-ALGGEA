"""Iteration 6 backend tests:
- Settings catalogs (list, get-by-key, put)
- Delete lock for paid_personally expense (must be reimbursed first => 409)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://profit-portal-59.preview.emergentagent.com").rstrip("/")
EMAIL = "ana.narvaez@socios.com"
PASSWORD = "Test#Ana-2026"

ALLOWED_KEYS = {"income_categories", "expense_categories", "payment_methods"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# -------- Settings catalog endpoints --------
class TestSettingsCatalogs:
    def test_list_catalogs(self, session):
        r = session.get(f"{BASE_URL}/api/settings/catalogs")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        keys = {c["key"] for c in data}
        assert ALLOWED_KEYS.issubset(keys), f"Missing keys: {ALLOWED_KEYS - keys}"
        for c in data:
            if c["key"] in ALLOWED_KEYS:
                assert "items" in c and isinstance(c["items"], list)
                assert "label" in c

    def test_get_by_key_income(self, session):
        r = session.get(f"{BASE_URL}/api/settings/catalogs/income_categories")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["key"] == "income_categories"
        assert isinstance(data["items"], list)

    def test_get_by_key_invalid(self, session):
        r = session.get(f"{BASE_URL}/api/settings/catalogs/not_a_real_key")
        assert r.status_code in (400, 404), f"Expected 400/404 got {r.status_code}: {r.text}"

    def test_put_catalog_round_trip(self, session):
        # Backup
        r = session.get(f"{BASE_URL}/api/settings/catalogs/income_categories")
        assert r.status_code == 200
        original_items = r.json()["items"]

        marker = f"test_marker_{uuid.uuid4().hex[:6]}"
        new_items = original_items + [{"value": marker, "label": "Test Marker"}]
        try:
            r = session.put(
                f"{BASE_URL}/api/settings/catalogs/income_categories",
                json={"items": new_items},
            )
            assert r.status_code == 200, r.text
            saved = r.json()
            assert any(it["value"] == marker for it in saved["items"])

            # GET verify persistence
            r2 = session.get(f"{BASE_URL}/api/settings/catalogs/income_categories")
            assert r2.status_code == 200
            assert any(it["value"] == marker for it in r2.json()["items"])
        finally:
            # cleanup -> restore original
            session.put(
                f"{BASE_URL}/api/settings/catalogs/income_categories",
                json={"items": original_items},
            )
            after = session.get(f"{BASE_URL}/api/settings/catalogs/income_categories").json()
            assert not any(it["value"] == marker for it in after["items"]), "cleanup failed"


# -------- Delete lock for paid_personally tx --------
class TestDeletePersonallyPaidLock:
    def test_create_personal_expense_then_delete_blocked_then_unlocked(self, session):
        # locate Ana partner id
        me = session.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200, me.text
        partner_id = me.json().get("id") or me.json().get("partner_id")
        assert partner_id, f"no partner id in /auth/me: {me.json()}"

        # Get a project to attach (optional, may be null)
        project_id = None
        projs = session.get(f"{BASE_URL}/api/projects")
        if projs.status_code == 200 and projs.json():
            project_id = projs.json()[0].get("id")

        # Create paid_personally expense
        payload = {
            "type": "expense",
            "amount": 1.23,
            "description": "TEST_iter6_personal_expense",
            "payment_method": "cash",
            "date": "2026-01-15",
            "category": "other",
            "project_id": project_id,
            "paid_personally": True,
            "partner_id": partner_id,
        }
        cr = session.post(f"{BASE_URL}/api/transactions", json=payload)
        assert cr.status_code in (200, 201), f"create failed {cr.status_code}: {cr.text}"
        tx = cr.json()
        tx_id = tx.get("id")
        assert tx_id, tx

        try:
            # Attempt delete -> expect 409
            d = session.delete(f"{BASE_URL}/api/transactions/{tx_id}")
            assert d.status_code == 409, f"expected 409 got {d.status_code}: {d.text}"
            # Spanish msg
            msg = (d.json().get("detail") if isinstance(d.json(), dict) else str(d.json()))
            assert "reembols" in str(msg).lower(), f"unexpected msg: {msg}"

            # Create a reimbursement covering the expense
            rb_payload = {
                "partner_id": partner_id,
                "amount": 1.23,
                "date": "2026-01-16",
                "description": "TEST_iter6_reimbursement",
                "source_transaction_ids": [tx_id],
            }
            rb = session.post(f"{BASE_URL}/api/reimbursements", json=rb_payload)
            # Endpoint name may vary; tolerate alt names
            if rb.status_code in (404, 405):
                rb = session.post(f"{BASE_URL}/api/partners/reimbursements", json=rb_payload)
            assert rb.status_code in (200, 201), f"reimbursement failed {rb.status_code}: {rb.text}"
            rb_id = rb.json().get("id")

            # Now delete should succeed
            d2 = session.delete(f"{BASE_URL}/api/transactions/{tx_id}")
            assert d2.status_code in (200, 204), f"delete after reimbursement failed {d2.status_code}: {d2.text}"
            tx_id = None  # marked deleted

            # cleanup reimbursement
            if rb_id:
                session.delete(f"{BASE_URL}/api/reimbursements/{rb_id}")
        finally:
            if tx_id:
                # best-effort cleanup
                session.delete(f"{BASE_URL}/api/transactions/{tx_id}")
