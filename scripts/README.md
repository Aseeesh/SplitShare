# Scripts

## ops (Python)

```bash
python -m venv scripts/ops/.venv && scripts/ops/.venv/bin/pip install -r scripts/ops/requirements.txt
scripts/ops/.venv/bin/python scripts/ops/cli.py status
scripts/ops/.venv/bin/python scripts/ops/cli.py promote you@example.com   # first super user
scripts/ops/.venv/bin/python scripts/ops/cli.py set-limit households 25
scripts/ops/.venv/bin/python scripts/ops/cli.py purge --dry-run
```

Reads `DIRECT_URL`/`DATABASE_URL` from the environment, then `.env`.

## deploy

`scripts/deploy/deploy.sh <target>` runs `scripts/deploy/targets/<target>.sh`.
The GitHub workflow picks the target from the repo variable `DEPLOY_TARGET`
(default `vercel`). To change host: add a target script, set the variable.

### One-time GitHub setup

| Kind | Name | For |
|---|---|---|
| secret | `VERCEL_TOKEN` | vercel target (create at vercel.com/account/tokens) |
| secret | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | vercel target (from `.vercel/project.json`) |
| variable | `DEPLOY_ENABLED` = `true` | switches the deploy job on |
| variable | `DEPLOY_TARGET` | optional, `vercel` or `cloudflare` |

Existing secrets (`DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`, …) are reused.
If Vercel's own Git deploys are still on, each push deploys twice; turn them off
under Project → Settings → Git once the Action works.
