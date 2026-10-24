"""Database engine and session management.

Defaults to SQLite for zero-setup local development; the same ORM models run
on PostgreSQL via docker-compose (see docker-compose.yml and README).
"""
from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _is_sqlite_mem(uri: str) -> bool:
    return uri.startswith("sqlite") and ("memory" in uri or uri.endswith(":memory:"))


def _make_engine(uri: str):
    if uri.startswith("sqlite"):
        os.makedirs(os.path.dirname(uri.replace("sqlite:///", "")) or "data", exist_ok=True)
        connect_args = {"check_same_thread": False}
        if _is_sqlite_mem(uri):
            uri = uri + ("&" if "?" in uri else "?") + "cache=shared"
        engine = create_engine(
            uri, echo=settings.DB_ECHO, connect_args=connect_args, future=True
        )

        @event.listens_for(engine, "connect")
        def _sqlite_pragma(dbapi_conn, _record):  # pragma: no cover
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

        return engine
    # PostgreSQL (psycopg3)
    return create_engine(uri, echo=settings.DB_ECHO, pool_pre_ping=True, future=True)


engine = _make_engine(settings.SQLALCHEMY_DATABASE_URI)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
