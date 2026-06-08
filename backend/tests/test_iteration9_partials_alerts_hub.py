"""Iteration 9 backend tests:
- Partial reimbursements
- Pending personal expenses semantics (reimbursed_amount/remaining_balance/reimbursed)
- Delete tx lock w/ partials
- Loan alerts settings + partners/portal alerts
- Hub CRUD + comments + filters
"""
import os
import time
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://loan-reconcile.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Credentials — Ana & Gabriel still on default pw (must_change_password=true but login still works);
# Luis already changed to Test2026!
CRED_ANA = ("ana.narvaez@socios.com", "Bienvenido2026!")
CRED_GAB = ("gabriel.barron@socios.com", "Bienvenido2026!")
CRED_LUIS_NEW = ("luis.noguez@socios.com", "Test2026!")
CRED_LUIS_OLD = ("luis.noguez@socios.com", "Bienvenido2026!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    # Try Luis with new password first, fallback to old
    r = _login(*CRED_LUIS_NEW)
    if r.status_code != 200:
        r = _login(*CRED_LUIS_OLD)
        if r.status_code != 200:
            # Try Ana
            r = _login(*CRED_ANA)
    assert r.status_code == 200, f"Cannot login: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    s.user_id = r.json()["user"]["id"]
    return s


@pytest.fixture(scope="session")
def partner_id(session):
    return session.user_id


# ---------- Test login ----------
class TestLogin:
    def test_basic_login(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert "id" in r.json()


# ---------- Partial reimbursements ----------
class TestPartialReimbursements:
    """All tests self-clean."""

    @staticmethod
    def _mk_expense(sess, partner_id, amount, desc, days_ago=1):
        d = (date.today() - timedelta(days=days_ago)).isoformat()
        payload = {
            "type": "expense", "amount": amount, "payment_method": "cash",
            "description": desc, "category": "general", "partner_id": partner_id,
            "paid_personally": True, "date": d,
        }
        r = sess.post(f"{API}/transactions", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    @staticmethod
    def _portal_owed(sess, partner_id):
        r = sess.get(f"{API}/partners/portal")
        assert r.status_code == 200
        p = next(x for x in r.json()["partners"] if x["id"] == partner_id)
        return p["personal_payments_owed"]

    def test_partial_300_on_1000_owed_700(self, session, partner_id):
        tx = self._mk_expense(session, partner_id, 1000.0, "TEST_partial_1000")
        try:
            owed_before = self._portal_owed(session, partner_id)
            r = session.post(f"{API}/reimbursements", json={
                "partner_id": partner_id, "amount": 300.0, "payment_method": "transfer",
                "description": "TEST_partial_300", "date": date.today().isoformat(),
                "source_transaction_ids": [tx], "partials": {tx: 300},
            })
            assert r.status_code == 200, r.text
            rb_id = r.json()["id"]
            owed_after = self._portal_owed(session, partner_id)
            assert round(owed_after - owed_before, 2) == -300.0, f"owed delta should be -300, got {owed_after-owed_before}"
            # cleanup rb
            session.delete(f"{API}/reimbursements/{rb_id}")
        finally:
            session.delete(f"{API}/transactions/{tx}")

    def test_three_partials_sum_to_full(self, session, partner_id):
        tx = self._mk_expense(session, partner_id, 1000.0, "TEST_3partials")
        rbs = []
        try:
            for amt in (300, 500, 200):
                r = session.post(f"{API}/reimbursements", json={
                    "partner_id": partner_id, "amount": amt, "payment_method": "cash",
                    "description": f"TEST_partial_{amt}", "date": date.today().isoformat(),
                    "source_transaction_ids": [tx], "partials": {tx: amt},
                })
                assert r.status_code == 200, f"amt={amt}: {r.text}"
                rbs.append(r.json()["id"])
            # check pending endpoint
            r = session.get(f"{API}/partners/{partner_id}/pending-personal-expenses")
            assert r.status_code == 200
            t = next(x for x in r.json() if x["id"] == tx)
            assert t["reimbursed_amount"] == 1000.0
            assert t["remaining_balance"] == 0.0
            assert t["reimbursed"] is True
        finally:
            for rid in rbs:
                session.delete(f"{API}/reimbursements/{rid}")
            session.delete(f"{API}/transactions/{tx}")

    def test_partial_exceeding_returns_409(self, session, partner_id):
        tx = self._mk_expense(session, partner_id, 1000.0, "TEST_exceed")
        rbs = []
        try:
            # apply 800 first
            r = session.post(f"{API}/reimbursements", json={
                "partner_id": partner_id, "amount": 800, "payment_method": "cash",
                "description": "TEST_800", "date": date.today().isoformat(),
                "source_transaction_ids": [tx], "partials": {tx: 800},
            })
            assert r.status_code == 200
            rbs.append(r.json()["id"])
            # try 300 (remaining = 200) → 409
            r = session.post(f"{API}/reimbursements", json={
                "partner_id": partner_id, "amount": 300, "payment_method": "cash",
                "description": "TEST_exceed_300", "date": date.today().isoformat(),
                "source_transaction_ids": [tx], "partials": {tx: 300},
            })
            assert r.status_code == 409, r.text
            assert "excede" in r.json().get("detail", "").lower() or "saldo" in r.json().get("detail", "").lower()
        finally:
            for rid in rbs:
                session.delete(f"{API}/reimbursements/{rid}")
            session.delete(f"{API}/transactions/{tx}")

    def test_post_on_fully_reimbursed_returns_409(self, session, partner_id):
        tx = self._mk_expense(session, partner_id, 500.0, "TEST_fully_done")
        rbs = []
        try:
            r = session.post(f"{API}/reimbursements", json={
                "partner_id": partner_id, "amount": 500, "payment_method": "cash",
                "description": "TEST_full500", "date": date.today().isoformat(),
                "source_transaction_ids": [tx], "partials": {tx: 500},
            })
            assert r.status_code == 200
            rbs.append(r.json()["id"])
            # try to post any more on same tx
            r = session.post(f"{API}/reimbursements", json={
                "partner_id": partner_id, "amount": 1, "payment_method": "cash",
                "description": "TEST_extra", "date": date.today().isoformat(),
                "source_transaction_ids": [tx], "partials": {tx: 1},
            })
            assert r.status_code == 409, r.text
            assert "ya fue reembolsado" in r.json().get("detail", "").lower()
        finally:
            for rid in rbs:
                session.delete(f"{API}/reimbursements/{rid}")
            session.delete(f"{API}/transactions/{tx}")

    def test_pending_endpoint_shape(self, session, partner_id):
        tx = self._mk_expense(session, partner_id, 400.0, "TEST_shape")
        rbs = []
        try:
            r = session.post(f"{API}/reimbursements", json={
                "partner_id": partner_id, "amount": 150, "payment_method": "cash",
                "description": "TEST_150", "date": date.today().isoformat(),
                "source_transaction_ids": [tx], "partials": {tx: 150},
            })
            assert r.status_code == 200
            rbs.append(r.json()["id"])
            r = session.get(f"{API}/partners/{partner_id}/pending-personal-expenses")
            assert r.status_code == 200
            t = next(x for x in r.json() if x["id"] == tx)
            assert {"reimbursed_amount", "remaining_balance", "reimbursed"} <= set(t.keys())
            assert t["reimbursed_amount"] == 150.0
            assert t["remaining_balance"] == 250.0
            assert t["reimbursed"] is False
        finally:
            for rid in rbs:
                session.delete(f"{API}/reimbursements/{rid}")
            session.delete(f"{API}/transactions/{tx}")


# ---------- Delete tx lock with partials ----------
class TestDeleteTxLockPartials:
    def test_delete_with_remaining_balance_blocked(self, session, partner_id):
        tx = TestPartialReimbursements._mk_expense(session, partner_id, 600.0, "TEST_dellock")
        r = session.post(f"{API}/reimbursements", json={
            "partner_id": partner_id, "amount": 200, "payment_method": "cash",
            "description": "TEST_p200", "date": date.today().isoformat(),
            "source_transaction_ids": [tx], "partials": {tx: 200},
        })
        rb_id = r.json()["id"]
        try:
            r = session.delete(f"{API}/transactions/{tx}")
            assert r.status_code == 409, r.text
        finally:
            session.delete(f"{API}/reimbursements/{rb_id}")
            session.delete(f"{API}/transactions/{tx}")

    def test_delete_when_fully_reimbursed_allowed(self, session, partner_id):
        tx = TestPartialReimbursements._mk_expense(session, partner_id, 100.0, "TEST_dellokfull")
        r = session.post(f"{API}/reimbursements", json={
            "partner_id": partner_id, "amount": 100, "payment_method": "cash",
            "description": "TEST_full100", "date": date.today().isoformat(),
            "source_transaction_ids": [tx], "partials": {tx: 100},
        })
        rb_id = r.json()["id"]
        try:
            r = session.delete(f"{API}/transactions/{tx}")
            assert r.status_code == 200, r.text
        finally:
            session.delete(f"{API}/reimbursements/{rb_id}")


# ---------- Loan alerts ----------
class TestLoanAlerts:
    def test_put_settings_and_reflect_in_portal(self, session):
        # restore defaults at end
        orig = session.get(f"{API}/settings/loan-alerts").json()
        try:
            r = session.put(f"{API}/settings/loan-alerts", json={"threshold_amount": 500, "threshold_days": 30})
            assert r.status_code == 200
            assert r.json()["threshold_amount"] == 500.0
            assert r.json()["threshold_days"] == 30
            r = session.get(f"{API}/partners/portal")
            assert r.status_code == 200
            data = r.json()
            assert data["alert_settings"]["threshold_amount"] == 500.0
            assert data["alert_settings"]["threshold_days"] == 30
            for p in data["partners"]:
                assert "alerts" in p and "alerts_count" in p and "has_critical_alert" in p
        finally:
            session.put(f"{API}/settings/loan-alerts", json=orig)

    def test_alert_severities(self, session, partner_id):
        # Set thresholds: $500 / 30 days
        orig = session.get(f"{API}/settings/loan-alerts").json()
        session.put(f"{API}/settings/loan-alerts", json={"threshold_amount": 500, "threshold_days": 30})
        # Create 3 tx: critical (big+old), warning_amt (big+recent), warning_days (small+old)
        tx_crit = TestPartialReimbursements._mk_expense(session, partner_id, 1000.0, "TEST_alert_critical", days_ago=45)
        tx_warn_amt = TestPartialReimbursements._mk_expense(session, partner_id, 800.0, "TEST_alert_warnamt", days_ago=5)
        tx_warn_days = TestPartialReimbursements._mk_expense(session, partner_id, 100.0, "TEST_alert_warndays", days_ago=45)
        try:
            r = session.get(f"{API}/partners/portal")
            partner = next(p for p in r.json()["partners"] if p["id"] == partner_id)
            alerts_by_tx = {a["tx_id"]: a for a in partner["alerts"]}
            assert alerts_by_tx[tx_crit]["severity"] == "critical"
            assert alerts_by_tx[tx_warn_amt]["severity"] == "warning"
            assert alerts_by_tx[tx_warn_amt]["exceeds_amount"] is True
            assert alerts_by_tx[tx_warn_amt]["exceeds_days"] is False
            assert alerts_by_tx[tx_warn_days]["severity"] == "warning"
            assert alerts_by_tx[tx_warn_days]["exceeds_days"] is True
            assert alerts_by_tx[tx_warn_days]["exceeds_amount"] is False
            assert partner["has_critical_alert"] is True
        finally:
            for tid in (tx_crit, tx_warn_amt, tx_warn_days):
                # need to fully reimburse first or it'll lock
                session.post(f"{API}/reimbursements", json={
                    "partner_id": partner_id, "amount": 9999, "payment_method": "cash",
                    "description": "TEST_clean", "date": date.today().isoformat(),
                    "source_transaction_ids": [tid],
                })
                session.delete(f"{API}/transactions/{tid}")
            # cleanup the reimbursements created above
            rbs = session.get(f"{API}/reimbursements", params={"partner_id": partner_id}).json()
            for r in rbs:
                if r.get("description") == "TEST_clean":
                    session.delete(f"{API}/reimbursements/{r['id']}")
            session.put(f"{API}/settings/loan-alerts", json=orig)


# ---------- Hub ----------
class TestHub:
    def test_create_note_and_list(self, session):
        r = session.post(f"{API}/hub", json={
            "type": "note", "title": "TEST_note", "content": "contenido", "tags": ["fiscal", "SAT"],
        })
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["type"] == "note"
        assert item["tags"] == ["fiscal", "SAT"]
        try:
            r = session.get(f"{API}/hub")
            assert any(x["id"] == item["id"] for x in r.json())
        finally:
            session.delete(f"{API}/hub/{item['id']}")

    def test_create_credential_full_fields(self, session):
        r = session.post(f"{API}/hub", json={
            "type": "credential", "title": "TEST_cred", "username": "user@x.com",
            "password": "S3cret!", "url": "https://sat.gob.mx", "tags": ["SAT"],
        })
        assert r.status_code == 200
        item = r.json()
        try:
            assert item["username"] == "user@x.com"
            assert item["password"] == "S3cret!"
            # GET returns full password
            r = session.get(f"{API}/hub")
            x = next(i for i in r.json() if i["id"] == item["id"])
            assert x["password"] == "S3cret!"
        finally:
            session.delete(f"{API}/hub/{item['id']}")

    def test_search_q_filter(self, session):
        r = session.post(f"{API}/hub", json={"type": "credential", "title": "TEST_QSAT", "username": "UNIQ_SAT_TOKEN_XYZ"})
        item = r.json()
        try:
            r = session.get(f"{API}/hub", params={"q": "UNIQ_SAT_TOKEN_XYZ"})
            assert any(x["id"] == item["id"] for x in r.json())
        finally:
            session.delete(f"{API}/hub/{item['id']}")

    def test_type_filter(self, session):
        r1 = session.post(f"{API}/hub", json={"type": "note", "title": "TEST_typenote"})
        r2 = session.post(f"{API}/hub", json={"type": "credential", "title": "TEST_typecred"})
        i1, i2 = r1.json(), r2.json()
        try:
            r = session.get(f"{API}/hub", params={"type": "credential"})
            ids = [x["id"] for x in r.json()]
            assert i2["id"] in ids
            assert i1["id"] not in ids
        finally:
            session.delete(f"{API}/hub/{i1['id']}")
            session.delete(f"{API}/hub/{i2['id']}")

    def test_update_and_delete(self, session):
        r = session.post(f"{API}/hub", json={"type": "note", "title": "TEST_upd1"})
        item = r.json()
        r = session.put(f"{API}/hub/{item['id']}", json={"type": "note", "title": "TEST_upd2", "pinned": True})
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_upd2"
        assert r.json()["pinned"] is True
        r = session.delete(f"{API}/hub/{item['id']}")
        assert r.status_code == 200

    def test_comments_add_and_delete_authz(self, session):
        # Create item with user A (current session)
        r = session.post(f"{API}/hub", json={"type": "note", "title": "TEST_comm"})
        item = r.json()
        try:
            r = session.post(f"{API}/hub/{item['id']}/comments", json={"text": "hola"})
            assert r.status_code == 200
            comments = r.json()["comments"]
            assert len(comments) == 1
            comment_id = comments[0]["id"]

            # Login as Ana to attempt delete the comment authored by current user
            ar = _login(*CRED_ANA)
            assert ar.status_code == 200
            ana_token = ar.json()["access_token"]
            ana = requests.Session()
            ana.headers.update({"Authorization": f"Bearer {ana_token}", "Content-Type": "application/json"})
            r = ana.delete(f"{API}/hub/{item['id']}/comments/{comment_id}")
            assert r.status_code == 403, r.text

            # delete by original author works
            r = session.delete(f"{API}/hub/{item['id']}/comments/{comment_id}")
            assert r.status_code == 200
            assert len(r.json()["comments"]) == 0
        finally:
            session.delete(f"{API}/hub/{item['id']}")
