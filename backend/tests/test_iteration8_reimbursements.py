"""
Iteration 8 - Reimbursement bug fix tests.

Bug: 'Préstamos Pendientes' duplicated instead of zeroing out when reimbursing.
Root cause: reimbursed_total was computed as sum(reimbursement.amount) which let
the same expense be counted twice (a manual reimbursement + a linked one).
Fix: reimbursed_total / personal_payments_owed now derive from the personal
expenses actually linked via source_transaction_ids. Validation added to block
double-linking, cross-partner linking, and missing-tx linking. Deletion of
paid_personally expenses without a reimbursement is blocked.

These tests exercise the /api/reimbursements, /api/transactions and
/api/partners/portal endpoints.
"""
import os
import uuid
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DEFAULT_PW = "Bienvenido2026!"
ANA_EMAIL = "ana.narvaez@socios.com"
GABRIEL_EMAIL = "gabriel.barron@socios.com"
LUIS_EMAIL = "luis.noguez@socios.com"


# ------------------------------------------------------------------ helpers
def _login(email: str, password: str = DEFAULT_PW):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def _create_personal_expense(token: str, partner_id: str, amount: float, desc: str) -> str:
    payload = {
        "type": "expense",
        "amount": amount,
        "payment_method": "cash",
        "description": desc,
        "category": "general",
        "partner_id": partner_id,
        "paid_personally": True,
        "date": date.today().isoformat(),
    }
    r = requests.post(f"{API}/transactions", json=payload, headers=_auth(token), timeout=15)
    assert r.status_code == 200, f"create tx failed: {r.status_code} {r.text}"
    return r.json()["id"]


def _portal_partner(token: str, partner_id: str):
    r = requests.get(f"{API}/partners/portal", headers=_auth(token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    for p in body["partners"]:
        if p["id"] == partner_id:
            return p
    raise AssertionError(f"partner {partner_id} not in portal")


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def ana():
    token, user = _login(ANA_EMAIL)
    return {"token": token, "id": user["id"], "name": user["name"]}


@pytest.fixture(scope="module")
def gabriel():
    token, user = _login(GABRIEL_EMAIL)
    return {"token": token, "id": user["id"], "name": user["name"]}


@pytest.fixture
def created_ids():
    """Track ids created during a test for teardown."""
    bag = {"tx": [], "rb": []}
    yield bag
    # cleanup: try to delete reimbursements first (frees expense delete lock), then txs.
    token, _ = _login(ANA_EMAIL)
    h = _auth(token)
    for rid in bag["rb"]:
        try:
            requests.delete(f"{API}/reimbursements/{rid}", headers=h, timeout=10)
        except Exception:
            pass
    for tid in bag["tx"]:
        try:
            requests.delete(f"{API}/transactions/{tid}", headers=h, timeout=10)
        except Exception:
            pass


# ============================================================ TESTS

class TestLoginBasics:
    def test_ana_login(self):
        token, user = _login(ANA_EMAIL)
        assert isinstance(token, str) and len(token) > 10
        assert user["email"] == ANA_EMAIL

    def test_invalid_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ANA_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401


class TestReimbursementManual:
    """Reimbursement with empty source_transaction_ids."""

    def test_manual_reimbursement_does_not_reduce_outstanding(self, ana, created_ids):
        h = _auth(ana["token"])

        # baseline outstanding
        before = _portal_partner(ana["token"], ana["id"])["personal_payments_owed"]

        # Create a personal expense (loan to company)
        tid = _create_personal_expense(ana["token"], ana["id"], 50.0, "TEST_manual_exp")
        created_ids["tx"].append(tid)
        after_exp = _portal_partner(ana["token"], ana["id"])["personal_payments_owed"]
        assert round(after_exp - before, 2) == 50.0

        # Create reimbursement WITHOUT linking source_transaction_ids
        rb_payload = {
            "partner_id": ana["id"],
            "amount": 50.0,
            "payment_method": "transfer",
            "description": "TEST_manual_rb",
            "date": date.today().isoformat(),
            "source_transaction_ids": [],
        }
        r = requests.post(f"{API}/reimbursements", json=rb_payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        rb = r.json()
        created_ids["rb"].append(rb["id"])
        assert rb["source_transaction_ids"] == []

        # Portal: outstanding must NOT have been reduced; cash_reimbursed_total grows by 50
        p = _portal_partner(ana["token"], ana["id"])
        assert round(p["personal_payments_owed"] - after_exp, 2) == 0.0, \
            "Manual reimbursement (no links) must NOT reduce personal_payments_owed"
        # reimbursed_total should reflect linked expenses only -> unchanged
        # cash_reimbursed_total should include the manual reimbursement
        assert p["cash_reimbursed_total"] >= 50.0


class TestReimbursementLinked:
    def test_linked_reimbursement_reduces_outstanding_exactly(self, ana, created_ids):
        h = _auth(ana["token"])

        before_owed = _portal_partner(ana["token"], ana["id"])["personal_payments_owed"]
        before_reimbursed = _portal_partner(ana["token"], ana["id"])["reimbursed_total"]

        # Two personal expenses
        t1 = _create_personal_expense(ana["token"], ana["id"], 100.0, "TEST_linked_a")
        t2 = _create_personal_expense(ana["token"], ana["id"], 23.0, "TEST_linked_b")
        created_ids["tx"].extend([t1, t2])

        owed_after_exp = _portal_partner(ana["token"], ana["id"])["personal_payments_owed"]
        assert round(owed_after_exp - before_owed, 2) == 123.0

        # Reimburse linking both
        rb_payload = {
            "partner_id": ana["id"],
            "amount": 123.0,
            "payment_method": "transfer",
            "description": "TEST_linked_rb",
            "date": date.today().isoformat(),
            "source_transaction_ids": [t1, t2],
        }
        r = requests.post(f"{API}/reimbursements", json=rb_payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        rb = r.json()
        created_ids["rb"].append(rb["id"])
        assert set(rb["source_transaction_ids"]) == {t1, t2}

        # Now owed should drop by exactly 123 and reimbursed_total should grow by 123
        p = _portal_partner(ana["token"], ana["id"])
        assert round(owed_after_exp - p["personal_payments_owed"], 2) == 123.0, \
            "Linked reimbursement should reduce outstanding by sum of linked exps"
        assert round(p["reimbursed_total"] - before_reimbursed, 2) == 123.0


class TestReimbursementValidations:
    def test_double_link_same_tx_returns_409(self, ana, created_ids):
        h = _auth(ana["token"])
        t1 = _create_personal_expense(ana["token"], ana["id"], 10.0, "TEST_double_link")
        created_ids["tx"].append(t1)

        # First reimbursement OK
        r1 = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 10.0, "payment_method": "transfer",
            "description": "TEST_rb_first", "date": date.today().isoformat(),
            "source_transaction_ids": [t1],
        }, headers=h, timeout=15)
        assert r1.status_code == 200, r1.text
        created_ids["rb"].append(r1.json()["id"])

        # Second reimbursement trying to link same tx -> 409 with "ya fue reembolsado"
        r2 = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 10.0, "payment_method": "transfer",
            "description": "TEST_rb_dup", "date": date.today().isoformat(),
            "source_transaction_ids": [t1],
        }, headers=h, timeout=15)
        assert r2.status_code == 409, f"Expected 409, got {r2.status_code} {r2.text}"
        assert "ya fue reembolsado" in r2.json().get("detail", "").lower() or \
               "reembolsado" in r2.json().get("detail", "").lower()

    def test_cross_partner_link_returns_409(self, ana, gabriel, created_ids):
        h_ana = _auth(ana["token"])
        # Create an expense belonging to Gabriel
        t_g = _create_personal_expense(gabriel["token"], gabriel["id"], 7.0, "TEST_cross_partner")
        created_ids["tx"].append(t_g)

        # Ana tries to reimburse that tx
        r = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 7.0, "payment_method": "transfer",
            "description": "TEST_rb_cross", "date": date.today().isoformat(),
            "source_transaction_ids": [t_g],
        }, headers=h_ana, timeout=15)
        assert r.status_code == 409, f"Expected 409, got {r.status_code} {r.text}"

    def test_nonexistent_tx_link_returns_409(self, ana, created_ids):
        h = _auth(ana["token"])
        fake_id = str(uuid.uuid4())
        r = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 5.0, "payment_method": "transfer",
            "description": "TEST_rb_nonexistent", "date": date.today().isoformat(),
            "source_transaction_ids": [fake_id],
        }, headers=h, timeout=15)
        assert r.status_code == 409, f"Expected 409, got {r.status_code} {r.text}"


class TestDeleteTxLock:
    def test_delete_pending_personal_expense_blocked_409(self, ana, created_ids):
        h = _auth(ana["token"])
        t = _create_personal_expense(ana["token"], ana["id"], 12.5, "TEST_delete_lock")
        created_ids["tx"].append(t)

        # Try to delete: should be 409
        r = requests.delete(f"{API}/transactions/{t}", headers=h, timeout=15)
        assert r.status_code == 409, f"Expected 409 lock, got {r.status_code} {r.text}"
        assert "no se puede eliminar" in r.json().get("detail", "").lower()

    def test_delete_reimbursed_personal_expense_allowed_200(self, ana, created_ids):
        h = _auth(ana["token"])
        t = _create_personal_expense(ana["token"], ana["id"], 17.0, "TEST_delete_after_rb")
        created_ids["tx"].append(t)

        # Reimburse it
        rb = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 17.0, "payment_method": "transfer",
            "description": "TEST_rb_for_delete", "date": date.today().isoformat(),
            "source_transaction_ids": [t],
        }, headers=h, timeout=15)
        assert rb.status_code == 200, rb.text
        created_ids["rb"].append(rb.json()["id"])

        # Now delete should be allowed
        r = requests.delete(f"{API}/transactions/{t}", headers=h, timeout=15)
        assert r.status_code == 200, f"Expected 200 deletion, got {r.status_code} {r.text}"
        # Drop from cleanup list because already deleted
        created_ids["tx"].remove(t)


class TestPortalSemantics:
    def test_reimbursed_total_vs_cash_reimbursed_total(self, ana, created_ids):
        """reimbursed_total = sum of LINKED personal expenses,
        cash_reimbursed_total = sum of all reimbursement.amount paid to partner."""
        h = _auth(ana["token"])
        before = _portal_partner(ana["token"], ana["id"])
        before_reimbursed = before["reimbursed_total"]
        before_cash = before["cash_reimbursed_total"]

        # 1) create a linked expense+reimbursement of 30
        t = _create_personal_expense(ana["token"], ana["id"], 30.0, "TEST_sem_linked")
        created_ids["tx"].append(t)
        rb1 = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 30.0, "payment_method": "transfer",
            "description": "TEST_sem_rb_linked", "date": date.today().isoformat(),
            "source_transaction_ids": [t],
        }, headers=h, timeout=15)
        assert rb1.status_code == 200, rb1.text
        created_ids["rb"].append(rb1.json()["id"])

        # 2) create a manual (no link) reimbursement of 20
        rb2 = requests.post(f"{API}/reimbursements", json={
            "partner_id": ana["id"], "amount": 20.0, "payment_method": "transfer",
            "description": "TEST_sem_rb_manual", "date": date.today().isoformat(),
            "source_transaction_ids": [],
        }, headers=h, timeout=15)
        assert rb2.status_code == 200, rb2.text
        created_ids["rb"].append(rb2.json()["id"])

        after = _portal_partner(ana["token"], ana["id"])
        # reimbursed_total grew by 30 (linked only)
        assert round(after["reimbursed_total"] - before_reimbursed, 2) == 30.0
        # cash_reimbursed_total grew by 50 (30+20)
        assert round(after["cash_reimbursed_total"] - before_cash, 2) == 50.0
