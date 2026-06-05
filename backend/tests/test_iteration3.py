"""
Iteration 3 backend tests:
- Clients & Providers CRUD + search + delete-in-use protection
- Transactions accept client_id / provider_id
- PUT /transactions and PUT /projects update audit + stamps
- Audit entity labels include client + provider
"""
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
    d = r.json()
    return {"token": d["access_token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['access_token']}"}}


@pytest.fixture(scope="module")
def carlos_id(auth):
    r = requests.get(f"{API}/partners", headers=auth["headers"])
    return next(p["id"] for p in r.json() if p["email"] == "carlos@socios.com")


# ---------- Clients CRUD ----------
class TestClients:
    def test_create_get_update_delete_client(self, auth):
        # CREATE
        payload = {"name": "TEST_Cli_Alpha", "rfc": "ABC123", "contact_name": "Juan",
                   "email": "j@ex.com", "phone": "555", "notes": "n"}
        r = requests.post(f"{API}/clients", json=payload, headers=auth["headers"])
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["name"] == payload["name"]
        assert c["rfc"] == "ABC123"
        assert c["created_by_id"] == auth["user"]["id"]
        cid = c["id"]

        # GET single
        r = requests.get(f"{API}/clients/{cid}", headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["name"] == payload["name"]

        # LIST
        r = requests.get(f"{API}/clients", headers=auth["headers"])
        assert r.status_code == 200
        names = [x["name"] for x in r.json()]
        assert "TEST_Cli_Alpha" in names

        # UPDATE
        payload["name"] = "TEST_Cli_Alpha_UPD"
        payload["rfc"] = "XYZ987"
        r = requests.put(f"{API}/clients/{cid}", json=payload, headers=auth["headers"])
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["name"] == "TEST_Cli_Alpha_UPD"
        assert upd["rfc"] == "XYZ987"
        assert upd["updated_by_id"] == auth["user"]["id"]

        # GET verify persistence
        r = requests.get(f"{API}/clients/{cid}", headers=auth["headers"])
        assert r.json()["name"] == "TEST_Cli_Alpha_UPD"

        # Audit entries
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "client"})
        actions = {(l["entity_id"], l["action"]) for l in r.json()}
        assert (cid, "create") in actions
        assert (cid, "update") in actions

        # DELETE
        r = requests.delete(f"{API}/clients/{cid}", headers=auth["headers"])
        assert r.status_code == 200
        r = requests.get(f"{API}/clients/{cid}", headers=auth["headers"])
        assert r.status_code == 404

        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "client", "action": "delete"})
        assert any(l["entity_id"] == cid for l in r.json())

    def test_search_filter(self, auth):
        # Create two clients
        a = requests.post(f"{API}/clients", json={"name": "TEST_SearchAlpha"},
                          headers=auth["headers"]).json()
        b = requests.post(f"{API}/clients", json={"name": "TEST_SearchBeta"},
                          headers=auth["headers"]).json()
        r = requests.get(f"{API}/clients", headers=auth["headers"],
                         params={"q": "searchalpha"})  # case-insensitive
        assert r.status_code == 200
        names = [x["name"] for x in r.json()]
        assert "TEST_SearchAlpha" in names
        assert "TEST_SearchBeta" not in names
        # cleanup
        requests.delete(f"{API}/clients/{a['id']}", headers=auth["headers"])
        requests.delete(f"{API}/clients/{b['id']}", headers=auth["headers"])

    def test_delete_in_use_returns_409(self, auth, carlos_id):
        # Create client + project referencing it
        c = requests.post(f"{API}/clients", json={"name": "TEST_InUseCli"},
                          headers=auth["headers"]).json()
        cid = c["id"]
        p = requests.post(f"{API}/projects", json={
            "name": "TEST_InUseProj", "client_id": cid, "status": "in_progress",
            "start_date": "2026-01-01"
        }, headers=auth["headers"])
        assert p.status_code == 200
        pid = p.json()["id"]

        r = requests.delete(f"{API}/clients/{cid}", headers=auth["headers"])
        assert r.status_code == 409
        assert "proyecto" in r.text.lower() or "1" in r.text

        # cleanup
        requests.delete(f"{API}/projects/{pid}", headers=auth["headers"])
        r = requests.delete(f"{API}/clients/{cid}", headers=auth["headers"])
        assert r.status_code == 200


# ---------- Providers CRUD ----------
class TestProviders:
    def test_crud_with_category(self, auth):
        payload = {"name": "TEST_Prov_X", "rfc": "PRV111", "category": "services"}
        r = requests.post(f"{API}/providers", json=payload, headers=auth["headers"])
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["category"] == "services"
        pid = p["id"]

        # update category
        payload["category"] = "materials"
        payload["name"] = "TEST_Prov_X_UPD"
        r = requests.put(f"{API}/providers/{pid}", json=payload, headers=auth["headers"])
        assert r.status_code == 200
        assert r.json()["category"] == "materials"
        assert r.json()["name"] == "TEST_Prov_X_UPD"

        # search
        r = requests.get(f"{API}/providers", headers=auth["headers"], params={"q": "prov_x_upd"})
        assert any(x["id"] == pid for x in r.json())

        # delete
        r = requests.delete(f"{API}/providers/{pid}", headers=auth["headers"])
        assert r.status_code == 200

        # audit
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "provider"})
        actions = {(l["entity_id"], l["action"]) for l in r.json()}
        for a in ("create", "update", "delete"):
            assert (pid, a) in actions, f"missing provider {a}"

    def test_delete_in_use_returns_409(self, auth, carlos_id):
        p = requests.post(f"{API}/providers", json={"name": "TEST_InUseProv"},
                          headers=auth["headers"]).json()
        prv_id = p["id"]
        tx = requests.post(f"{API}/transactions", json={
            "type": "expense", "amount": 10, "payment_method": "cash",
            "description": "TEST_linked_prov", "partner_id": carlos_id,
            "date": "2026-01-10", "provider_id": prv_id, "paid_personally": False,
        }, headers=auth["headers"])
        assert tx.status_code == 200, tx.text
        tx_id = tx.json()["id"]

        r = requests.delete(f"{API}/providers/{prv_id}", headers=auth["headers"])
        assert r.status_code == 409

        # cleanup
        requests.delete(f"{API}/transactions/{tx_id}", headers=auth["headers"])
        r = requests.delete(f"{API}/providers/{prv_id}", headers=auth["headers"])
        assert r.status_code == 200


# ---------- Transactions accept client/provider IDs + PUT update ----------
class TestTransactionsLinks:
    def test_income_with_client_and_put_update(self, auth, carlos_id):
        # Create a client
        cli = requests.post(f"{API}/clients", json={"name": "TEST_TxCli"},
                            headers=auth["headers"]).json()
        cid = cli["id"]
        # project too
        proj = requests.post(f"{API}/projects", json={
            "name": "TEST_TxProj", "client_id": cid, "status": "in_progress",
            "start_date": "2026-01-01"
        }, headers=auth["headers"]).json()
        pid = proj["id"]

        # Create income tx with client_id + project_id
        r = requests.post(f"{API}/transactions", json={
            "type": "income", "amount": 1000, "payment_method": "transfer",
            "description": "TEST_inc_linked", "partner_id": carlos_id,
            "date": "2026-01-15", "client_id": cid, "project_id": pid,
        }, headers=auth["headers"])
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["client_id"] == cid
        assert tx["project_id"] == pid
        assert tx["provider_id"] is None
        tx_id = tx["id"]

        # PUT to update description (and ensure client_id persists if sent)
        upd_payload = {
            "type": "income", "amount": 1500, "payment_method": "transfer",
            "description": "TEST_inc_linked_UPD", "partner_id": carlos_id,
            "date": "2026-01-15", "client_id": cid, "project_id": pid,
        }
        r = requests.put(f"{API}/transactions/{tx_id}", json=upd_payload,
                         headers=auth["headers"])
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["amount"] == 1500
        assert upd["description"] == "TEST_inc_linked_UPD"
        assert upd["client_id"] == cid
        assert upd["updated_by_id"] == auth["user"]["id"]
        assert upd["updated_at"]

        # audit update
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "transaction", "action": "update"})
        assert any(l["entity_id"] == tx_id for l in r.json())

        # cleanup
        requests.delete(f"{API}/transactions/{tx_id}", headers=auth["headers"])
        requests.delete(f"{API}/projects/{pid}", headers=auth["headers"])
        requests.delete(f"{API}/clients/{cid}", headers=auth["headers"])

    def test_expense_with_provider(self, auth, carlos_id):
        prv = requests.post(f"{API}/providers", json={"name": "TEST_TxProv", "category": "taxes"},
                            headers=auth["headers"]).json()
        prv_id = prv["id"]
        r = requests.post(f"{API}/transactions", json={
            "type": "expense", "amount": 200, "payment_method": "cash",
            "description": "TEST_exp_prov", "partner_id": carlos_id,
            "date": "2026-01-12", "provider_id": prv_id, "paid_personally": False,
        }, headers=auth["headers"])
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["provider_id"] == prv_id
        assert tx["client_id"] is None
        tx_id = tx["id"]
        # cleanup
        requests.delete(f"{API}/transactions/{tx_id}", headers=auth["headers"])
        requests.delete(f"{API}/providers/{prv_id}", headers=auth["headers"])


# ---------- Projects PUT audit + stamps ----------
class TestProjectUpdate:
    def test_put_project_updates_fields_and_audit(self, auth):
        cli = requests.post(f"{API}/clients", json={"name": "TEST_ProjCli"},
                            headers=auth["headers"]).json()
        cid = cli["id"]
        cli2 = requests.post(f"{API}/clients", json={"name": "TEST_ProjCli2"},
                             headers=auth["headers"]).json()
        cid2 = cli2["id"]
        r = requests.post(f"{API}/projects", json={
            "name": "TEST_ProjU", "client_id": cid, "status": "in_progress",
            "start_date": "2026-01-01"
        }, headers=auth["headers"])
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        r = requests.put(f"{API}/projects/{pid}", json={
            "name": "TEST_ProjU_UPD", "client_id": cid2, "status": "completed",
            "start_date": "2026-01-01", "end_date": "2026-02-01"
        }, headers=auth["headers"])
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["name"] == "TEST_ProjU_UPD"
        assert upd["client_id"] == cid2
        assert upd["status"] == "completed"
        assert upd["end_date"] == "2026-02-01"
        assert upd["updated_by_id"] == auth["user"]["id"]
        assert upd["updated_at"]
        assert upd.get("updated_by_name")  # stamps include name

        # Audit
        r = requests.get(f"{API}/audit-logs", headers=auth["headers"],
                         params={"entity_type": "project", "action": "update"})
        assert any(l["entity_id"] == pid for l in r.json())

        # cleanup
        requests.delete(f"{API}/projects/{pid}", headers=auth["headers"])
        requests.delete(f"{API}/clients/{cid}", headers=auth["headers"])
        requests.delete(f"{API}/clients/{cid2}", headers=auth["headers"])
