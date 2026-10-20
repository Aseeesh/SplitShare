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


class CliTests(unittest.TestCase):
    def test_user_scope_needs_a_target(self):
        self.assertEqual(cli.main(["set-limit", "user", "5"]), 2)

    def test_invalid_limit_is_a_usage_error(self):
        self.assertEqual(cli.main(["set-limit", "households", "0"]), 2)

    def test_unknown_command_exits(self):
        with self.assertRaises(SystemExit):
            cli.main(["explode"])


if __name__ == "__main__":
    unittest.main()
