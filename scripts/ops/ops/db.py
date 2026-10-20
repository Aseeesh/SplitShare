"""One short-lived connection per command, with a clean transaction boundary."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg

from . import config


@contextmanager
def connect() -> Iterator[psycopg.Connection]:
    # `with` commits on success and rolls back on any exception.
    with psycopg.connect(config.database_url(), connect_timeout=15) as conn:
        yield conn
