"""Limit rules. Pure, so they are unit-tested without a database."""

from __future__ import annotations

MIN_LIMIT = 1
MAX_LIMIT = 1000

PLATFORM_KEYS = {
    "households": "max_households_per_admin",
    "members": "max_members_per_household",
}


def validate_limit(value: int) -> int:
    """Mirror of the app's `isValidLimit`: a whole number from 1 to 1000."""
    if not MIN_LIMIT <= value <= MAX_LIMIT:
        raise ValueError(f"limit must be between {MIN_LIMIT} and {MAX_LIMIT}, got {value}")
    return value
