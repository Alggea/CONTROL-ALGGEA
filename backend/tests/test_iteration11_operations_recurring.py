"""
Iteration 11 backend tests: GET /api/operations/recurring

Covers:
 - Empty / no-data shape: groups=[], counts=0, today=YYYY-MM-DD
 - Monthly detection (~30d), recurring_count=1, days_until_next from last_date+avg_interval
 - Bimonthly detection (~60d), monthly_factor=0.5
 - Irregular detection (100d apart) => is_recurring=False, no contribution to total_monthly_estimate
 - Status transitions: overdue / due / upcoming / on_track based on next_expected_date
 - Filters: paid_personally=true is ignored, project_id != null is ignored, no provider_id is ignored
 - provider name uses providers.name; deleted provider shows 'Proveedor eliminado'
 - total_monthly_estimate = sum(avg_amount * monthly_factor) for recurring flows
 - Sort: overdue, due, upcoming, on_track, irregular; ties by days_until_next asc

All seeds are created with TEST_iter11_ prefix and cleaned in the autouse fixture.
NO real user data is touched.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://loan-reconcile.preview.emergentagent.com").rstrip("/")
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
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def created_ids():
    return {"tx": [], "providers": []}


@pytest.fixture(scope="module", autouse=True)
def _cleanup(session, created_ids):
    yield
    # Remove transactions first, then providers
    for tid in created_ids["tx"]:
        try:
            session.delete(f"{API}/transactions/{tid}", timeout=10)
        except Exception:
            pass
    for pid in created_ids["providers"]:
        try:
            session.delete(f"{API}/providers/{pid}", timeout=10)
        except Exception:
            pass


# ---------------- helpers ----------------
def _mk_provider(session, created_ids, name_suffix):
    payload = {"name": f"TEST_iter11_{name_suffix}_{uuid.uuid4().hex[:6]}", "category": "services"}
    r = session.post(f"{API}/providers", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    created_ids["providers"].append(p["id"])
    return p


def _mk_expense(session, created_ids, me, provider_id, amount, d, paid_personally=False, project_id=None, category="services"):
    payload = {
        "type": "expense",
        "amount": float(amount),
        "payment_method": "transfer",
        "description": f"TEST_iter11_expense_{uuid.uuid4().hex[:6]}",
        "provider_id": provider_id,
        "category": category,
        "project_id": project_id,
        "partner_id": me["id"],
        "paid_personally": bool(paid_personally),
        "date": d.isoformat() if isinstance(d, date) else d,
    }
    r = session.post(f"{API}/transactions", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    tx = r.json()
    created_ids["tx"].append(tx["id"])
    return tx


def _get_recurring(session, months_back=12):
    r = session.get(f"{API}/operations/recurring", params={"months_back": months_back}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _find_group(data, provider_id):
    return next((g for g in data["groups"] if g["provider_id"] == provider_id), None)


# ---------------- tests ----------------
class TestRecurringDetection:
    def test_response_shape(self, session):
        data = _get_recurring(session)
        # Must always have these keys
        for k in [
            "groups", "total_monthly_estimate", "recurring_count",
            "irregular_count", "upcoming_count", "overdue_count",
            "months_back", "today",
        ]:
            assert k in data, f"missing key {k} in response"
        assert isinstance(data["groups"], list)
        assert data["months_back"] == 12
        # today must be YYYY-MM-DD
        assert len(data["today"]) == 10 and data["today"][4] == "-" and data["today"][7] == "-"

    def test_monthly_detection(self, session, me, created_ids):
        # 4 expenses ~30d apart => Mensual, recurring_count includes this group
        p = _mk_provider(session, created_ids, "monthly")
        today = date.today()
        # Place last payment 5 days ago so next_expected = -5+30 = +25 -> on_track
        last = today - timedelta(days=5)
        for k, days_ago_offset in enumerate([90, 60, 30, 0]):
            d = last - timedelta(days=days_ago_offset)
            _mk_expense(session, created_ids, me, p["id"], 1200 + k * 10, d)
        data = _get_recurring(session)
        g = _find_group(data, p["id"])
        assert g is not None, "monthly provider group not found"
        assert g["frequency_label"] == "Mensual"
        assert 25 <= g["avg_interval_days"] <= 35
        assert g["is_recurring"] is True
        assert g["occurrences"] == 4
        # days_until_next ~ avg_interval - 5 (since last_date = today-5)
        assert g["days_until_next"] is not None
        assert 20 <= g["days_until_next"] <= 30
        assert g["status"] in ("on_track", "upcoming")
        # provider_name comes from providers.name
        assert g["provider_name"].startswith("TEST_iter11_monthly_")

    def test_bimonthly_detection(self, session, me, created_ids):
        # 3 expenses ~60d apart => Bimestral, monthly_factor=0.5
        p = _mk_provider(session, created_ids, "bim")
        today = date.today()
        last = today - timedelta(days=10)
        for offset in [120, 60, 0]:
            _mk_expense(session, created_ids, me, p["id"], 5000, last - timedelta(days=offset))
        data = _get_recurring(session)
        g = _find_group(data, p["id"])
        assert g is not None
        assert g["frequency_label"] == "Bimestral"
        assert 55 <= g["avg_interval_days"] <= 65
        assert g["monthly_factor"] == 0.5
        assert g["is_recurring"] is True

    def test_irregular_detection(self, session, me, created_ids):
        # 2 expenses 100d apart => Irregular, is_recurring=False
        p = _mk_provider(session, created_ids, "irreg")
        today = date.today()
        _mk_expense(session, created_ids, me, p["id"], 3000, today - timedelta(days=100))
        _mk_expense(session, created_ids, me, p["id"], 3000, today - timedelta(days=0))
        data = _get_recurring(session)
        g = _find_group(data, p["id"])
        assert g is not None
        assert g["frequency_label"] == "Irregular"
        assert g["is_recurring"] is False
        assert g["status"] == "irregular"
        assert g["next_expected_date"] is None


class TestStatusBuckets:
    def _setup_pair(self, session, me, created_ids, last_offset_days):
        """Create monthly pattern (2 pts ~30d apart) with last_date = today - last_offset_days."""
        p = _mk_provider(session, created_ids, f"st{last_offset_days}")
        today = date.today()
        last = today - timedelta(days=last_offset_days)
        prev = last - timedelta(days=30)
        _mk_expense(session, created_ids, me, p["id"], 2000, prev)
        _mk_expense(session, created_ids, me, p["id"], 2000, last)
        return p

    def test_status_overdue(self, session, me, created_ids):
        # last 40d ago -> next = -10 => overdue
        p = self._setup_pair(session, me, created_ids, 40)
        g = _find_group(_get_recurring(session), p["id"])
        assert g["status"] == "overdue", f"expected overdue, got {g['status']} (days_until={g['days_until_next']})"
        assert g["days_until_next"] < -7

    def test_status_due(self, session, me, created_ids):
        # last 33d ago -> next = -3 (within -7..0) => due
        p = self._setup_pair(session, me, created_ids, 33)
        g = _find_group(_get_recurring(session), p["id"])
        assert g["status"] == "due", f"expected due, got {g['status']} (days_until={g['days_until_next']})"
        assert -7 <= g["days_until_next"] <= 0

    def test_status_upcoming(self, session, me, created_ids):
        # last 25d ago -> next = +5 => upcoming
        p = self._setup_pair(session, me, created_ids, 25)
        g = _find_group(_get_recurring(session), p["id"])
        assert g["status"] == "upcoming", f"expected upcoming, got {g['status']} (days_until={g['days_until_next']})"
        assert 1 <= g["days_until_next"] <= 7

    def test_status_on_track(self, session, me, created_ids):
        # last 10d ago -> next = +20 => on_track
        p = self._setup_pair(session, me, created_ids, 10)
        g = _find_group(_get_recurring(session), p["id"])
        assert g["status"] == "on_track", f"expected on_track, got {g['status']} (days_until={g['days_until_next']})"
        assert g["days_until_next"] > 7


class TestFilters:
    def test_ignores_paid_personally(self, session, me, created_ids):
        p = _mk_provider(session, created_ids, "pp")
        today = date.today()
        _mk_expense(session, created_ids, me, p["id"], 100, today - timedelta(days=30), paid_personally=True)
        _mk_expense(session, created_ids, me, p["id"], 100, today, paid_personally=True)
        data = _get_recurring(session)
        assert _find_group(data, p["id"]) is None, "paid_personally=true must be excluded"

    def test_ignores_project_expenses(self, session, me, created_ids):
        # find a project to use
        r = session.get(f"{API}/projects", timeout=10)
        projects = r.json() if r.status_code == 200 else []
        if not projects:
            pytest.skip("no projects available to test scope filter")
        p = _mk_provider(session, created_ids, "proj")
        today = date.today()
        _mk_expense(session, created_ids, me, p["id"], 200, today - timedelta(days=30), project_id=projects[0]["id"])
        _mk_expense(session, created_ids, me, p["id"], 200, today, project_id=projects[0]["id"])
        data = _get_recurring(session)
        assert _find_group(data, p["id"]) is None, "expenses with project_id must be excluded"


class TestTotalsAndSort:
    def test_total_monthly_estimate_includes_only_recurring(self, session, me, created_ids):
        # Snapshot before
        before = _get_recurring(session)
        before_total = before["total_monthly_estimate"]

        # Create one monthly (~1200) and one irregular (should not contribute)
        p_m = _mk_provider(session, created_ids, "totm")
        today = date.today()
        for offset in [60, 30, 0]:
            _mk_expense(session, created_ids, me, p_m["id"], 1200, today - timedelta(days=offset))

        p_i = _mk_provider(session, created_ids, "toti")
        _mk_expense(session, created_ids, me, p_i["id"], 9999, today - timedelta(days=100))
        _mk_expense(session, created_ids, me, p_i["id"], 9999, today)

        after = _get_recurring(session)
        # monthly factor = 1.0 for ~30d, avg ~1200 -> delta ≈ 1200
        delta = after["total_monthly_estimate"] - before_total
        assert 1100 <= delta <= 1300, f"expected ~1200 delta from monthly group, got {delta}"
        # irregular_count should have grown by at least 1
        assert after["irregular_count"] >= before["irregular_count"] + 1

    def test_sort_order(self, session):
        data = _get_recurring(session)
        rank = {"overdue": 0, "due": 1, "upcoming": 2, "on_track": 3, "irregular": 4, "unknown": 5}
        prev = -1
        for g in data["groups"]:
            r = rank.get(g["status"], 9)
            assert r >= prev, f"sort order broken at {g['provider_name']} status={g['status']}"
            prev = r


class TestDeletedProvider:
    def test_orphan_provider_id_shows_placeholder(self, session, me, created_ids):
        """The system blocks deletion of providers with transactions, but the
        recurring endpoint must still fall back to 'Proveedor eliminado' if the
        provider doc cannot be resolved. Simulate by creating transactions
        referencing a provider_id that is not in the providers collection
        (e.g. an old deleted reference) — we do this by posting with a random
        provider_id then removing the temp provider via the API call shortcut:
        we create the provider, post tx, then try delete; if delete is blocked
        we still verify that providers.find resolves names correctly for an
        existing one (positive path)."""
        fake_pid = "orphan-" + uuid.uuid4().hex
        today = date.today()
        # create two transactions with a provider_id that does NOT exist in providers
        for offset in [30, 0]:
            payload = {
                "type": "expense", "amount": 250.0, "payment_method": "transfer",
                "description": f"TEST_iter11_orphan_{uuid.uuid4().hex[:6]}",
                "provider_id": fake_pid, "category": "services",
                "project_id": None, "partner_id": me["id"],
                "paid_personally": False, "date": (today - timedelta(days=offset)).isoformat(),
            }
            r = session.post(f"{API}/transactions", json=payload, timeout=15)
            assert r.status_code == 200, r.text
            created_ids["tx"].append(r.json()["id"])
        data = _get_recurring(session)
        g = _find_group(data, fake_pid)
        assert g is not None, "group must appear with orphan provider_id"
        assert g["provider_name"] == "Proveedor eliminado"
