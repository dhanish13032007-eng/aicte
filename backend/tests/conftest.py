"""Shared pytest fixtures: isolated in-memory database + API test client."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# must be set BEFORE importing the app (overrides .env defaults)
os.environ["ENVIRONMENT"] = "testing"
os.environ["SQLALCHEMY_DATABASE_URI"] = "sqlite+pysqlite:///file:test_db?mode=memory&cache=shared"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app


@pytest.fixture(scope="session")
def engine():
    from app.db import engine as eng

    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture()
def db_session(engine):
    TestSess = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestSess()
    # clean slate per test
    from sqlalchemy import text

    for table in reversed(Base.metadata.sorted_tables):
        session.execute(text(f'DELETE FROM "{table.name}"'))
    session.commit()
    yield session
    session.close()


@pytest.fixture()
def client(engine, db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def seeded(db_session, client):
    """Seed demo data into the fresh test DB and yield a helper for logins."""
    from app.seed import seed

    counts = seed(db_session)
    db_session.commit()

    def login(email: str, password: str = "Demo@12345") -> dict:
        r = client.post("/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    return {"counts": counts, "token": login, "client": client}
