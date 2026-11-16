from fastapi.testclient import TestClient


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/api/v1/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


def test_winner_site_and_previews_are_allowed(client: TestClient):
    for origin in (
        "https://winner-cakes.pages.dev",
        "https://abc123.winner-cakes.pages.dev",
    ):
        response = _preflight(client, origin)
        assert response.headers.get("access-control-allow-origin") == origin


def test_other_pages_dev_sites_are_not_allowed(client: TestClient):
    for origin in ("https://evil.pages.dev", "https://winner-cakes.pages.dev.evil.com"):
        response = _preflight(client, origin)
        assert response.headers.get("access-control-allow-origin") is None
