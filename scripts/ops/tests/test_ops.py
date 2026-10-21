import argparse
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cli  # noqa: E402
from ops import config  # noqa: E402
from ops.limits import validate_limit  # noqa: E402


class LimitTests(unittest.TestCase):
    def test_accepts_the_valid_range(self):
        for value in (1, 20, 1000):
            self.assertEqual(validate_limit(value), value)

    def test_rejects_out_of_range(self):
        for value in (0, -1, 1001):
            with self.assertRaises(ValueError):
                validate_limit(value)


class ConfigTests(unittest.TestCase):
    def test_environment_beats_the_env_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, ".env").write_text('FOO="from-file"\n# comment\nBAR=two\n')
            with mock.patch.object(config, "REPO_ROOT", Path(tmp)):
                with mock.patch.dict(os.environ, {"FOO": "from-env"}):
                    self.assertEqual(config.get("FOO"), "from-env")
                    self.assertEqual(config.get("BAR"), "two")
                os.environ.pop("FOO", None)
                self.assertEqual(config.get("FOO"), "from-file")

    def test_require_exits_when_missing(self):
        with mock.patch.object(config, "get", return_value=None):
            with self.assertRaises(SystemExit):
                config.require("NOPE")

    def test_direct_url_preferred_over_pooled(self):
        values = {"DIRECT_URL": "direct", "DATABASE_URL": "pooled"}
        with mock.patch.object(config, "get", side_effect=lambda n, d=None: values.get(n, d)):
            self.assertEqual(config.database_url(), "direct")


class WaitTests(unittest.TestCase):
    def _run(self, responses):
        import time
        from ops import commands
        args = cli.build_parser().parse_args(
            ["wait", "https://x.test", "abcdef1234", "--timeout", "5", "--interval", "0"]
        )
        it = iter(responses)
        with mock.patch.object(commands, "_request", side_effect=lambda *_a, **_k: next(it)):
            with mock.patch.object(time, "sleep"):
                return commands.wait_for_sha(args)

    def test_succeeds_once_the_new_sha_is_serving(self):
        old = (200, b'{"sha": "0000000"}')
        new = (200, b'{"sha": "abcdef1234"}')
        self.assertEqual(self._run([old, (503, b""), new]), 0)


class AllocationTests(unittest.TestCase):
    def test_apportion_matches_the_typescript_rule(self):
        from ops.allocation import apportion

        self.assertEqual(apportion(100, [("c", 1), ("a", 1), ("b", 1)]), {"a": 34, "b": 33, "c": 33})
        self.assertEqual(apportion(0, [("a", 1)]), {})

    def test_oldest_share_first_and_overpayment_is_not_allocated(self):
        from ops.allocation import Share, plan_allocation

        shares = [
            Share("s1", "e1", 5000, [("ann", 10000)]),
            Share("s2", "e2", 3000, [("ann", 6000)]),
        ]
        plan = plan_allocation(shares, "ann", 9000)
        self.assertEqual([(a.share_id, a.cents, a.settles) for a in plan], [("s1", 5000, True), ("s2", 3000, True)])

    def test_partial_payment_does_not_settle(self):
        from ops.allocation import Share, plan_allocation

        plan = plan_allocation([Share("s1", "e1", 5000, [("ann", 10000)])], "ann", 2000)
        self.assertEqual([(a.cents, a.settles) for a in plan], [(2000, False)])

    def test_a_payment_to_one_funder_covers_only_their_portion(self):
        from ops.allocation import Share, plan_allocation

        share = Share("s1", "e1", 10000, [("ann", 6000), ("bob", 4000)])
        first = plan_allocation([share], "ann", 7000)
        self.assertEqual([(a.cents, a.settles) for a in first], [(6000, False)])
        second = plan_allocation([share], "bob", 4000)
        self.assertEqual([(a.cents, a.settles) for a in second], [(4000, True)])


class CliTests(unittest.TestCase):
    def test_user_scope_needs_a_target(self):
        self.assertEqual(cli.main(["set-limit", "user", "5"]), 2)

    def test_invalid_limit_is_a_usage_error(self):
        self.assertEqual(cli.main(["set-limit", "households", "0"]), 2)

    def test_unknown_command_exits(self):
        with self.assertRaises(SystemExit):
            cli.main(["explode"])



class RunCronRetryTests(unittest.TestCase):
    def setUp(self) -> None:
        from ops import commands

        self.commands = commands
        self.args = argparse.Namespace(url="https://example.test")
        patcher = mock.patch.dict(os.environ, {"CRON_SECRET": "s"})
        patcher.start()
        self.addCleanup(patcher.stop)
        sleeper = mock.patch.object(commands.time, "sleep", lambda _s: None)
        sleeper.start()
        self.addCleanup(sleeper.stop)

    def test_retries_server_errors_until_success(self) -> None:
        responses = [(503, b"cold"), (502, b"bad"), (200, b"{}")]
        with mock.patch.object(self.commands, "_request", side_effect=responses) as req:
            self.assertEqual(self.commands.run_cron(self.args), 0)
            self.assertEqual(req.call_count, 3)

    def test_never_retries_an_auth_failure(self) -> None:
        with mock.patch.object(self.commands, "_request", return_value=(401, b"no")) as req:
            self.assertEqual(self.commands.run_cron(self.args), 1)
            self.assertEqual(req.call_count, 1)

    def test_gives_up_after_three_failed_attempts(self) -> None:
        with mock.patch.object(self.commands, "_request", return_value=(500, b"x")) as req:
            self.assertEqual(self.commands.run_cron(self.args), 1)
            self.assertEqual(req.call_count, 3)


if __name__ == "__main__":
    unittest.main()

