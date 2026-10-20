#!/usr/bin/env python3
"""SplitHome operations CLI.

    python scripts/ops/cli.py status
    python scripts/ops/cli.py promote you@example.com
    python scripts/ops/cli.py set-limit households 25
    python scripts/ops/cli.py purge --dry-run
    python scripts/ops/cli.py smoke https://your-app.example

Day-to-day management lives in the app's admin console; this is for bootstrap
(the first super user) and for scheduled jobs that must not depend on any one
hosting platform.
"""

from __future__ import annotations

import argparse
import sys

from ops import commands


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ops", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="counts of users, households and pending purges").set_defaults(
        run=commands.status
    )

    p = sub.add_parser("promote", help="grant (or --revoke) super-user rights")
    p.add_argument("email")
    p.add_argument("--revoke", action="store_true")
    p.set_defaults(run=commands.promote)

    p = sub.add_parser("set-limit", help="set a platform, user or household limit")
    p.add_argument("scope", choices=["households", "members", "user", "household"])
    p.add_argument("value", type=int)
    p.add_argument("target", nargs="?", help="email (user) or id (household)")
    p.set_defaults(run=commands.set_limit)

    p = sub.add_parser("purge", help="delete households archived more than 30 days ago")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(run=commands.purge)

    p = sub.add_parser("backfill-allocations", help="apply pre-allocation payments to shares")
    p.add_argument("--apply", action="store_true", help="write changes (default is a dry run)")
    p.set_defaults(run=commands.backfill_allocations)

    p = sub.add_parser("run-cron", help="trigger reminders + recurring expenses")
    p.add_argument("--url")
    p.set_defaults(run=commands.run_cron)

    p = sub.add_parser("wait", help="wait until /api/health serves the given commit")
    p.add_argument("url")
    p.add_argument("sha")
    p.add_argument("--timeout", type=int, default=900)
    p.add_argument("--interval", type=int, default=15)
    p.set_defaults(run=commands.wait_for_sha)

    p = sub.add_parser("smoke", help="post-deploy HTTP checks")
    p.add_argument("url")
    p.set_defaults(run=commands.smoke)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "set-limit" and args.scope in ("user", "household") and not args.target:
        print(f"error: set-limit {args.scope} needs a target", file=sys.stderr)
        return 2
    try:
        return args.run(args)
    except ValueError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
