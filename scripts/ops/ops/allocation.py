"""Payment-allocation rules, mirroring src/lib/payments/allocate.ts.

Kept pure so the rules can be unit-tested without a database, and so the
back-fill and the application cannot drift apart without a test noticing.
Floats are used on purpose: JavaScript numbers are IEEE doubles, exactly like
Python floats, so `apportion` rounds identically on both sides.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


def apportion(total: int, weights: list[tuple[str, int]]) -> dict[str, int]:
    """Split `total` in proportion to `weights` with no cent lost or invented.

    Floors each share, then gives leftover cents to the largest remainders, ties
    broken by id ascending (the §2.6 determinism).
    """
    weight_sum = sum(w for _, w in weights)
    if total == 0 or weight_sum <= 0:
        return {}
    parts = []
    for ident, weight in weights:
        exact = (total * weight) / weight_sum
        floor = math.floor(exact)
        parts.append([ident, floor, exact - floor])
    left = total - sum(p[1] for p in parts)
    for part in sorted(parts, key=lambda p: (-p[2], p[0])):
        if left > 0:
            part[1] += 1
            left -= 1
    return {ident: floor for ident, floor, _ in parts if floor != 0}


@dataclass
class Share:
    id: str
    expense_id: str
    amount: int
    funders: list[tuple[str, int]]
    # (recipient_user_id, cents) for every confirmed payment / allocation so far.
    covers: list[tuple[str, int]] = field(default_factory=list)


@dataclass
class Allocation:
    share_id: str
    expense_id: str
    cents: int
    settles: bool


def plan_allocation(shares: list[Share], to_user: str, amount: int) -> list[Allocation]:
    """Apply a confirmed payment to `shares`, already ordered oldest first."""
    left = amount
    plan: list[Allocation] = []
    for share in shares:
        if left <= 0:
            break
        portion = apportion(share.amount, share.funders).get(to_user, 0)
        if portion <= 0:
            continue
        covered_all = sum(c for _, c in share.covers)
        covered_to = sum(c for to, c in share.covers if to == to_user)
        remaining = portion - covered_to
        if remaining <= 0:
            continue
        take = min(left, remaining)
        left -= take
        plan.append(Allocation(share.id, share.expense_id, take, covered_all + take >= share.amount))
        # Later payments in the same run must see this allocation.
        share.covers.append((to_user, take))
    return plan
