"""
Iteration 7 backend tests:
 - project_statuses catalog (default 5 items, color field)
 - PUT new project_status with color, GET reflects change, restore
 - Files multi-upload + GET metadata + project.file_ids persistence
"""
import io
import os
import pytest
import requests
from pathlib import Path
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "ana.narvaez@socios.com"
PASSWORD = "Test#Ana-2026"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------- project_statuses catalog ----------
def test_default_project_statuses(auth):
    r = auth.get(f"{API}/settings/catalogs/project_statuses")
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items", [])
    by_value = {it["value"]: it for it in items}
    expected = {
        "in_progress": "blue",
        "started": "indigo",
        "paid": "emerald",
        "with_debt": "amber",
        "completed": "slate",
    }
    for v, color in expected.items():
        assert v in by_value, f"missing status {v}"
        assert by_value[v].get("color") == color, f"{v} color={by_value[v].get('color')}"


def test_catalogs_list_includes_project_statuses(auth):
    r = auth.get(f"{API}/settings/catalogs")
    assert r.status_code == 200
    keys = [c["key"] for c in r.json()]
    for k in ["income_categories", "expense_categories", "payment_methods", "project_statuses"]:
        assert k in keys, f"missing catalog key {k}"


def test_put_project_statuses_add_color_and_restore(auth):
    # GET original
    orig = auth.get(f"{API}/settings/catalogs/project_statuses").json()["items"]
    # Append new
    new_items = orig + [{"value": "test_review", "label": "TEST En revisión", "color": "purple"}]
    r = auth.put(f"{API}/settings/catalogs/project_statuses", json={"items": new_items})
    assert r.status_code == 200, r.text
    # Verify
    after = auth.get(f"{API}/settings/catalogs/project_statuses").json()["items"]
    found = next((it for it in after if it["value"] == "test_review"), None)
    assert found is not None
    assert found.get("color") == "purple"
    assert found.get("label") == "TEST En revisión"
    # Restore
    r = auth.put(f"{API}/settings/catalogs/project_statuses", json={"items": orig})
    assert r.status_code == 200
    after2 = auth.get(f"{API}/settings/catalogs/project_statuses").json()["items"]
    assert not any(it["value"] == "test_review" for it in after2)


def test_change_color_and_restore(auth):
    orig = auth.get(f"{API}/settings/catalogs/project_statuses").json()["items"]
    changed = [
        {**it, "color": ("red" if it["value"] == "in_progress" else it.get("color"))}
        for it in orig
    ]
    r = auth.put(f"{API}/settings/catalogs/project_statuses", json={"items": changed})
    assert r.status_code == 200
    after = auth.get(f"{API}/settings/catalogs/project_statuses").json()["items"]
    ip = next(it for it in after if it["value"] == "in_progress")
    assert ip.get("color") == "red"
    # Restore
    r = auth.put(f"{API}/settings/catalogs/project_statuses", json={"items": orig})
    assert r.status_code == 200


# ---------- File upload + project.file_ids ----------
def _png_bytes():
    # 1x1 transparent PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )


def test_upload_two_files_and_attach_to_project(auth):
    # upload file 1
    files1 = {"file": ("TEST_a.png", io.BytesIO(_png_bytes()), "image/png")}
    r1 = auth.post(f"{API}/files/upload", files=files1)
    assert r1.status_code in (200, 201), r1.text
    f1 = r1.json()
    files2 = {"file": ("TEST_b.png", io.BytesIO(_png_bytes()), "image/png")}
    r2 = auth.post(f"{API}/files/upload", files=files2)
    assert r2.status_code in (200, 201), r2.text
    f2 = r2.json()

    # GET metadata
    m1 = auth.get(f"{API}/files/{f1['id']}")
    assert m1.status_code == 200
    assert m1.json().get("content_type", "").startswith("image/")

    # Create project with file_ids
    payload = {
        "name": "TEST_ITER7_PROJECT",
        "description": "iter7 test",
        "status": "in_progress",
        "start_date": "2026-01-01",
        "file_ids": [f1["id"], f2["id"]],
    }
    rp = auth.post(f"{API}/projects", json=payload)
    assert rp.status_code in (200, 201), rp.text
    proj = rp.json()
    pid = proj["id"]
    try:
        # GET project and verify file_ids persisted
        gp = auth.get(f"{API}/projects/{pid}")
        assert gp.status_code == 200
        assert set(gp.json().get("file_ids", [])) == {f1["id"], f2["id"]}
    finally:
        # cleanup project
        auth.delete(f"{API}/projects/{pid}")


def test_invalid_catalog_key_rejected(auth):
    r = auth.put(f"{API}/settings/catalogs/bogus_key", json={"items": []})
    assert r.status_code in (400, 404, 422)
