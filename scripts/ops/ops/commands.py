"""The subcommands. Each takes the parsed args and returns a process exit code."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

from . import config, db
from .limits import PLATFORM_KEYS, validate_limit

RETENTION_DAYS = 30


def _email(value: str) -> str:
    return value.strip().lower()


def _audit(conn, action: str, entity_type: str, entity_id: str | None, before, after) -> None:
    """Platform audit row for an operator change (no actor: it came from the CLI)."""
    conn.execute(
        "INSERT INTO platform_audit_logs (id, actor_user_id, action, entity_type, entity_id, before_json, after_json) "
        "VALUES (gen_random_uuid(), NULL, %s, %s, %s, %s::jsonb, %s::jsonb)",
        (action, entity_type, entity_id, json.dumps(before), json.dumps(after)),
    )


def status(_: argparse.Namespace) -> int:
    with db.connect() as conn:
        users = conn.execute(
            'SELECT count(*), count(*) FILTER (WHERE is_super_user), '
            'count(*) FILTER (WHERE disabled_at IS NOT NULL) '
            'FROM users WHERE NOT is_placeholder'
        ).fetchone()
        households = conn.execute(
            "SELECT status, count(*) FROM households GROUP BY 1 ORDER BY 1"
        ).fetchall()
        due = conn.execute(
            "SELECT count(*) FROM households WHERE status = 'ARCHIVED' "
            "AND archived_at < now() - make_interval(days => %s)",
            (RETENTION_DAYS,),
        ).fetchone()
        settings = conn.execute("SELECT key, value FROM platform_settings ORDER BY key").fetchall()
    print(json.dumps({
        "users": {"total": users[0], "super_users": users[1], "suspended": users[2]},
        "households": {row[0]: row[1] for row in households},
        "awaiting_purge": due[0],
        "platform_settings": {row[0]: row[1] for row in settings},
    }, indent=2))
    return 0


def promote(args: argparse.Namespace) -> int:
    """Grant or revoke super-user rights. The account must already exist (signed in once)."""
    email = _email(args.email)
    with db.connect() as conn:
        row = conn.execute(
            "UPDATE users SET is_super_user = %s, updated_at = now() "
            "WHERE lower(email) = %s AND NOT is_placeholder RETURNING id",
            (not args.revoke, email),
        ).fetchone()
        if row is not None:
            _audit(conn, "SUPERUSER_CHANGED", "user", str(row[0]),
                   {"super_user": args.revoke}, {"super_user": not args.revoke})
    if row is None:
        print(f"error: no account for {email}. They must sign in once first.", file=sys.stderr)
        return 1
    print(f"{'revoked' if args.revoke else 'granted'} super user: {email}")
    return 0


def set_limit(args: argparse.Namespace) -> int:
    value = validate_limit(args.value)
    with db.connect() as conn:
        if args.scope in PLATFORM_KEYS:
            conn.execute(
                "INSERT INTO platform_settings (key, value, updated_at) VALUES (%s, %s, now()) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
                (PLATFORM_KEYS[args.scope], value),
            )
            _audit(conn, "PLATFORM_LIMITS_CHANGED", "platform_settings", PLATFORM_KEYS[args.scope],
                   None, {args.scope: value})
            print(f"platform {args.scope} limit = {value}")
        elif args.scope == "user":
            row = conn.execute(
                "UPDATE users SET max_households_override = %s, updated_at = now() "
                "WHERE lower(email) = %s RETURNING id",
                (value, _email(args.target)),
            ).fetchone()
            if row is None:
                print(f"error: no account for {args.target}", file=sys.stderr)
                return 1
            _audit(conn, "USER_LIMIT_CHANGED", "user", str(row[0]), None, {"maxHouseholds": value})
            print(f"{args.target}: household limit = {value}")
        else:
            row = conn.execute(
                "UPDATE households SET max_members_override = %s, updated_at = now() "
                "WHERE id = %s::uuid RETURNING id",
                (value, args.target),
            ).fetchone()
            if row is None:
                print(f"error: no household {args.target}", file=sys.stderr)
                return 1
            _audit(conn, "HOUSEHOLD_LIMIT_CHANGED", "household", str(row[0]), None, {"maxMembers": value})
            print(f"household {args.target}: member limit = {value}")
    return 0


def purge(args: argparse.Namespace) -> int:
    """Permanently delete households archived more than 30 days ago.

    The work, including the safety check, is in the SQL function
    `purge_expired_households`; it is the only path allowed past the append-only
    triggers, and only for the length of its own transaction.
    """
    with db.connect() as conn:
        due = conn.execute(
            "SELECT id, name, archived_at FROM households WHERE status = 'ARCHIVED' "
            "AND archived_at < now() - make_interval(days => %s)",
            (RETENTION_DAYS,),
        ).fetchall()
        for hid, name, at in due:
            print(f"{'would purge' if args.dry_run else 'purging'}: {name} ({hid}), archived {at:%Y-%m-%d}")
        if args.dry_run or not due:
            print(f"{len(due)} household(s) due")
            return 0
        purged = conn.execute("SELECT purge_expired_households(%s)", (RETENTION_DAYS,)).fetchone()[0]
    print(f"purged {purged} household(s)")
    return 0


def _request(url: str, headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def run_cron(args: argparse.Namespace) -> int:
    """Trigger the app's reminders/recurring job. Replaces a platform cron."""
    base = (args.url or config.require("NEXT_PUBLIC_APP_URL")).rstrip("/")
    secret = config.require("CRON_SECRET")
    code, body = _request(f"{base}/api/cron/reminders", {"Authorization": f"Bearer {secret}"})
    print(f"{code} {body.decode(errors='replace')[:300]}")
    return 0 if code == 200 else 1


def wait_for_sha(args: argparse.Namespace) -> int:
    """Block until /api/health reports the commit we just released.

    A deploy hook returns before the build finishes, so smoke-testing straight
    away would test the previous release. Polling for the SHA proves the new one
    is the one serving, on any host that exposes it.
    """
    import time

    base = args.url.rstrip("/")
    deadline = time.monotonic() + args.timeout
    seen = None
    while time.monotonic() < deadline:
        code, body = _request(f"{base}/api/health")
        if code == 200:
            try:
                seen = json.loads(body).get("sha")
            except ValueError:
                seen = None
            if seen == args.sha:
                print(f"live: {args.sha[:7]}")
                return 0
        print(f"waiting… status={code} serving={str(seen)[:7]} want={args.sha[:7]}")
        time.sleep(args.interval)
    print(f"error: {args.sha[:7]} was not live after {args.timeout}s", file=sys.stderr)
    return 1


def smoke(args: argparse.Namespace) -> int:
    """Post-deploy checks. The cron route must reject anonymous calls (§20)."""
    base = args.url.rstrip("/")
    checks = [
        ("sign-in page renders", f"{base}/signin", None, 200),
        ("landing page renders", f"{base}/", None, 200),
        ("cron rejects anonymous", f"{base}/api/cron/reminders", None, 401),
        ("manifest served", f"{base}/manifest.webmanifest", None, 200),
        ("health: app and database up", f"{base}/api/health", None, 200),
    ]
    failed = 0
    for label, url, headers, want in checks:
        code, _ = _request(url, headers)
        ok = code == want
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {label}: {code} (want {want})")
    return 1 if failed else 0
