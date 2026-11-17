import uuid

import pytest
from fastapi.testclient import TestClient

from src.application.festival import use_cases as festival_use_cases
from tests.api.conftest import auth_headers, register_user


@pytest.fixture(autouse=True)
def _clear_cache():
    festival_use_cases._public_cache.clear()


def _setup(client: TestClient):
    owner = register_user(client, organization_name="Doces", email="dona@doces.io")
    headers = auth_headers(owner["access_token"])
    org = client.get("/api/v1/organizations", headers=headers).json()[0]
    return org["id"], org["slug"], headers


def _config(day_items=None, **kw):
    payload = {
        "public_enabled": True,
        "status": "aberto",
        "items": day_items
        or [
            {"id": "ninho", "flavor": "Ninho com morango", "price": 15, "slices_total": 3},
            {"id": "red", "flavor": "Red Velvet", "price": 14, "slices_total": 10},
        ],
    }
    payload.update(kw)
    return payload


def _sale(lines, method="dinheiro", sale_id=None):
    return {"id": sale_id or uuid.uuid4().hex, "lines": lines, "method": method}


def test_default_menu_uses_store_flavors(client: TestClient):
    org_id, _slug, headers = _setup(client)
    r = client.get(f"/api/v1/organizations/{org_id}/festival-live/2026-12-05", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date"] == "2026-12-05"
    assert len(body["items"]) > 0
    assert all(i["slices_total"] == 0 and i["sold"] == 0 for i in body["items"])
    assert body["sales"] == []


def test_sale_decrements_stock_and_is_idempotent(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    assert client.put(base, json=_config(), headers=headers).status_code == 200

    sale = _sale([{"item_id": "ninho", "qty": 2}, {"item_id": "red", "qty": 1}], sale_id="venda-000001")
    r = client.post(f"{base}/sales", json=sale, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    sold = {i["id"]: i["sold"] for i in body["items"]}
    assert sold == {"ninho": 2, "red": 1}
    assert body["sales"][0]["total"] == 44

    # Reenvio da mesma venda (internet caiu na resposta): não vende de novo.
    again = client.post(f"{base}/sales", json=sale, headers=headers).json()
    assert {i["id"]: i["sold"] for i in again["items"]} == {"ninho": 2, "red": 1}
    assert len(again["sales"]) == 1


def test_cannot_sell_more_than_remaining(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    client.put(base, json=_config(), headers=headers)
    r = client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 4}]), headers=headers)
    assert r.status_code == 409
    assert "restam 3" in r.json()["detail"]
    client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 3}]), headers=headers)
    r = client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 1}]), headers=headers)
    assert r.status_code == 409
    assert "esgotou" in r.json()["detail"]


def test_cancel_returns_slices(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    client.put(base, json=_config(), headers=headers)
    client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 3}], sale_id="venda-cancel1"), headers=headers)
    r = client.post(f"{base}/sales/venda-cancel1/cancel", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["items"][0]["sold"] == 0
    assert body["sales"][0]["canceled"] is True
    assert client.post(f"{base}/sales/nao-existe/cancel", headers=headers).status_code == 404


def test_config_keeps_sold_counts(client: TestClient):
    org_id, _slug, headers = _setup(client)
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"
    client.put(base, json=_config(), headers=headers)
    client.post(f"{base}/sales", json=_sale([{"item_id": "red", "qty": 2}]), headers=headers)
    items = [
        {"id": "red", "flavor": "Red Velvet", "price": 14, "slices_total": 20},
        {"id": "pistache", "flavor": "Pistache", "price": 18, "slices_total": 8},
    ]
    body = client.put(base, json=_config(items), headers=headers).json()
    assert {i["id"]: (i["slices_total"], i["sold"]) for i in body["items"]} == {
        "red": (20, 2),
        "pistache": (8, 0),
    }


def test_public_live_menu_only_today_and_enabled(client: TestClient, monkeypatch):
    org_id, slug, headers = _setup(client)
    monkeypatch.setattr(festival_use_cases, "today_brt", lambda: "2026-12-05")
    base = f"/api/v1/organizations/{org_id}/festival-live/2026-12-05"

    assert client.get(f"/api/v1/public/stores/{slug}/festival-live").json() == {"live": None}

    client.put(base, json=_config(public_enabled=False), headers=headers)
    festival_use_cases._public_cache.clear()
    assert client.get(f"/api/v1/public/stores/{slug}/festival-live").json() == {"live": None}

    client.put(base, json=_config(), headers=headers)
    client.post(f"{base}/sales", json=_sale([{"item_id": "ninho", "qty": 3}]), headers=headers)
    festival_use_cases._public_cache.clear()
    live = client.get(f"/api/v1/public/stores/{slug}/festival-live").json()["live"]
    assert live["status"] == "aberto"
    by = {i["flavor"]: i for i in live["items"]}
    assert by["Ninho com morango"]["sold_out"] is True
    assert by["Red Velvet"]["remaining"] == 10
    assert "sold" not in by["Red Velvet"]


def test_invalid_day(client: TestClient):
    org_id, _slug, headers = _setup(client)
    r = client.get(f"/api/v1/organizations/{org_id}/festival-live/amanha", headers=headers)
    assert r.status_code == 422
