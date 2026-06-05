"""
Backend tests for Admin Control (Mexican company partner control).
Covers: auth, partners, projects, transactions, dividends, dashboard, portal.
"""
import os
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

CARLOS = {"email": "carlos@socios.com", "password": "socio123"}
ANA = {"email": "ana@socios.com", "password": "socio123"}
WRONG = {"email": "carlos@socios.com", "password": "wrong"}


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    r = session.post(f"{API}/auth/login", json=CARLOS, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    return {"token": token, "user": data["user"], "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def partners(session, auth):
    r = session.get(f"{API}/partners", headers=auth["headers"])
    assert r.status_code == 200
    return r.json()


# ---------------- Auth tests ----------------
class TestAuth:
    def test_login_valid(self, session):
        r = session.post(f"{API}/auth/login", json=CARLOS)
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and isinstance(d["access_token"], str)
        assert d["user"]["email"] == "carlos@socios.com"
        assert d["user"]["name"]

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json=WRONG)
        assert r.status_code == 401

    def test_me_with_bearer(self, session, auth):
        r = session.get(f"{API}/auth/me", headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["email"] == "carlos@socios.com"

    def test_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_logout(self, session, auth):
        r = session.post(f"{API}/auth/logout", headers=auth["headers"])
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------------- Partners ----------------
class TestPartners:
    def test_list_partners_count(self, partners):
        assert len(partners) == 3
        emails = {p["email"] for p in partners}
        assert {"carlos@socios.com", "ana@socios.com", "diego@socios.com"} <= emails


# ---------------- Helper to clean ----------------
def cleanup_all(session, headers):
    for ep in ("transactions", "dividends", "projects"):
        r = session.get(f"{API}/{ep}", headers=headers)
        if r.status_code == 200:
            for item in r.json():
                session.delete(f"{API}/{ep}/{item['id']}", headers=headers)


# ---------------- Projects ----------------
class TestProjects:
    @pytest.fixture(autouse=True)
    def _clean(self, session, auth):
        cleanup_all(session, auth["headers"])
        yield
        cleanup_all(session, auth["headers"])

    def test_project_crud(self, session, auth):
        payload = {
            "name": "TEST_Proj",
            "description": "desc",
            "client_name": "Cliente X",
            "status": "in_progress",
            "start_date": "2026-01-01",
            "end_date": None,
        }
        r = session.post(f"{API}/projects", json=payload, headers=auth["headers"])
        assert r.status_code == 200, r.text
        proj = r.json()
        pid = proj["id"]
        assert proj["name"] == "TEST_Proj"
        assert proj["status"] == "in_progress"

        # GET list
        r = session.get(f"{API}/projects", headers=auth["headers"])
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())

        # GET single
        r = session.get(f"{API}/projects/{pid}", headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["id"] == pid

        # PUT
        payload["status"] = "completed"
        payload["name"] = "TEST_Proj_Updated"
        r = session.put(f"{API}/projects/{pid}", json=payload, headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["status"] == "completed"
        # verify persisted
        r = session.get(f"{API}/projects/{pid}", headers=auth["headers"])
        assert r.json()["name"] == "TEST_Proj_Updated"

        # DELETE
        r = session.delete(f"{API}/projects/{pid}", headers=auth["headers"])
        assert r.status_code == 200
        r = session.get(f"{API}/projects/{pid}", headers=auth["headers"])
        assert r.status_code == 404

    def test_project_pnl(self, session, auth, partners):
        # create project
        r = session.post(f"{API}/projects", json={
            "name": "TEST_PnL",
            "status": "in_progress",
            "start_date": "2026-01-01",
        }, headers=auth["headers"])
        pid = r.json()["id"]
        carlos_id = next(p["id"] for p in partners if p["email"] == "carlos@socios.com")

        # add income 1000 and expense 200 linked to project
        for tx in [
            {"type": "income", "amount": 1000, "payment_method": "transfer", "description": "ingreso", "partner_id": carlos_id, "project_id": pid, "date": "2026-01-05"},
            {"type": "expense", "amount": 200, "payment_method": "cash", "description": "gasto", "partner_id": carlos_id, "project_id": pid, "date": "2026-01-06"},
        ]:
            r = session.post(f"{API}/transactions", json=tx, headers=auth["headers"])
            assert r.status_code == 200, r.text

        r = session.get(f"{API}/projects/{pid}/pnl", headers=auth["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["income"] == 1000
        assert d["expenses"] == 200
        assert d["net"] == 800
        assert len(d["transactions"]) == 2


# ---------------- Transactions ----------------
class TestTransactions:
    @pytest.fixture(autouse=True)
    def _clean(self, session, auth):
        cleanup_all(session, auth["headers"])
        yield
        cleanup_all(session, auth["headers"])

    def test_create_and_filters(self, session, auth, partners):
        carlos_id = next(p["id"] for p in partners if p["email"] == "carlos@socios.com")
        ana_id = next(p["id"] for p in partners if p["email"] == "ana@socios.com")

        # Create project for filtering
        rp = session.post(f"{API}/projects", json={
            "name": "TEST_Filter", "status": "in_progress", "start_date": "2026-01-01"
        }, headers=auth["headers"])
        pid = rp.json()["id"]

        txs = [
            {"type": "income", "amount": 500, "payment_method": "cash", "description": "i1", "partner_id": carlos_id, "project_id": pid, "date": "2026-01-01"},
            {"type": "expense", "amount": 100, "payment_method": "transfer", "description": "e1", "partner_id": ana_id, "date": "2026-01-02", "paid_personally": True},
            {"type": "income", "amount": 200, "payment_method": "transfer", "description": "i2", "partner_id": ana_id, "date": "2026-01-03"},
        ]
        created_ids = []
        for tx in txs:
            r = session.post(f"{API}/transactions", json=tx, headers=auth["headers"])
            assert r.status_code == 200, r.text
            created_ids.append(r.json()["id"])
            assert r.json()["amount"] == tx["amount"]

        # filter type=income
        r = session.get(f"{API}/transactions?type=income", headers=auth["headers"])
        assert r.status_code == 200
        assert all(t["type"] == "income" for t in r.json())
        assert len(r.json()) == 2

        # filter partner_id=ana
        r = session.get(f"{API}/transactions?partner_id={ana_id}", headers=auth["headers"])
        assert all(t["partner_id"] == ana_id for t in r.json())
        assert len(r.json()) == 2

        # filter project_id
        r = session.get(f"{API}/transactions?project_id={pid}", headers=auth["headers"])
        assert all(t["project_id"] == pid for t in r.json())
        assert len(r.json()) == 1

        # filter payment_method=cash
        r = session.get(f"{API}/transactions?payment_method=cash", headers=auth["headers"])
        assert all(t["payment_method"] == "cash" for t in r.json())
        assert len(r.json()) == 1

        # delete one
        r = session.delete(f"{API}/transactions/{created_ids[0]}", headers=auth["headers"])
        assert r.status_code == 200
        r = session.get(f"{API}/transactions", headers=auth["headers"])
        assert len(r.json()) == 2


# ---------------- Dividends ----------------
class TestDividends:
    @pytest.fixture(autouse=True)
    def _clean(self, session, auth):
        cleanup_all(session, auth["headers"])
        yield
        cleanup_all(session, auth["headers"])

    def test_dividend_crud(self, session, auth, partners):
        carlos_id = next(p["id"] for p in partners if p["email"] == "carlos@socios.com")
        r = session.post(f"{API}/dividends", json={
            "partner_id": carlos_id, "amount": 250.0, "description": "retiro test", "date": "2026-01-10"
        }, headers=auth["headers"])
        assert r.status_code == 200, r.text
        div = r.json()
        assert div["amount"] == 250.0
        assert div["partner_id"] == carlos_id
        did = div["id"]

        r = session.get(f"{API}/dividends", headers=auth["headers"])
        assert any(d["id"] == did for d in r.json())

        r = session.delete(f"{API}/dividends/{did}", headers=auth["headers"])
        assert r.status_code == 200
        r = session.get(f"{API}/dividends", headers=auth["headers"])
        assert not any(d["id"] == did for d in r.json())


# ---------------- Dashboard & Portal math ----------------
class TestDashboardAndPortal:
    @pytest.fixture(autouse=True)
    def _clean(self, session, auth):
        cleanup_all(session, auth["headers"])
        yield
        cleanup_all(session, auth["headers"])

    def test_dashboard_summary_math(self, session, auth, partners):
        carlos_id = partners[0]["id"]
        # income 300 cash, expense 100 transfer
        session.post(f"{API}/transactions", json={
            "type": "income", "amount": 300, "payment_method": "cash",
            "description": "i", "partner_id": carlos_id, "date": "2026-01-01"
        }, headers=auth["headers"])
        session.post(f"{API}/transactions", json={
            "type": "expense", "amount": 100, "payment_method": "transfer",
            "description": "e", "partner_id": carlos_id, "date": "2026-01-02"
        }, headers=auth["headers"])

        r = session.get(f"{API}/dashboard/summary", headers=auth["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["total_income"] == 300
        assert d["total_expenses"] == 100
        assert d["net_balance"] == 200
        assert d["cash_balance"] == 300  # 300 in, 0 out
        assert d["transfer_balance"] == -100  # 0 in, 100 out
        assert isinstance(d["trend"], list)
        assert isinstance(d["recent_transactions"], list)

    def test_portal_3333_math(self, session, auth, partners):
        # income 300 -> share 100 each
        carlos = next(p for p in partners if p["email"] == "carlos@socios.com")
        ana = next(p for p in partners if p["email"] == "ana@socios.com")

        session.post(f"{API}/transactions", json={
            "type": "income", "amount": 300, "payment_method": "transfer",
            "description": "i", "partner_id": carlos["id"], "date": "2026-01-01"
        }, headers=auth["headers"])
        # Ana paid 50 personally as expense
        session.post(f"{API}/transactions", json={
            "type": "expense", "amount": 50, "payment_method": "cash",
            "description": "e personal", "partner_id": ana["id"], "date": "2026-01-02",
            "paid_personally": True
        }, headers=auth["headers"])

        # Carlos withdraws dividend 30
        session.post(f"{API}/dividends", json={
            "partner_id": carlos["id"], "amount": 30, "description": "ret", "date": "2026-01-05"
        }, headers=auth["headers"])

        r = session.get(f"{API}/partners/portal", headers=auth["headers"])
        assert r.status_code == 200
        d = r.json()
        # net balance = 300 - 50 = 250 ; share = 250/3
        expected_share = 250 / 3
        assert abs(d["net_balance"] - 250) < 0.01
        assert abs(d["per_partner_share"] - expected_share) < 0.01
        assert len(d["partners"]) == 3

        by_id = {p["id"]: p for p in d["partners"]}
        # Carlos: share - dividend = expected_share - 30, no personal
        c = by_id[carlos["id"]]
        assert abs(c["share_percent"] - 100/3) < 0.01
        assert c["personal_payments_owed"] == 0
        assert c["dividends_withdrawn"] == 30
        assert abs(c["available_to_collect"] - (expected_share + 0 - 30)) < 0.01

        # Ana: personal_payments_owed = 50
        a = by_id[ana["id"]]
        assert a["personal_payments_owed"] == 50
        assert a["dividends_withdrawn"] == 0
        assert abs(a["available_to_collect"] - (expected_share + 50)) < 0.01
