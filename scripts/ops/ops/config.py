"""Configuration: environment first, then a local .env file for developers."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get(name: str, default: str | None = None) -> str | None:
    """Real environment wins, so CI secrets always override a stray local .env."""
    if name in os.environ and os.environ[name] != "":
        return os.environ[name]
    return _parse_env_file(REPO_ROOT / ".env").get(name, default)


def require(name: str) -> str:
    value = get(name)
    if not value:
        raise SystemExit(f"error: {name} is not set (environment or .env)")
    return value


def database_url() -> str:
    """The direct URL when present: DDL and long statements must not use a pooler."""
    return get("DIRECT_URL") or require("DATABASE_URL")
