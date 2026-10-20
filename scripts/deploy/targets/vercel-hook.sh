# Vercel via a project Deploy Hook: no API token needed. The hook makes Vercel
# build the production branch from Git, so this target only has to trigger it;
# the workflow then waits for /api/health to report the new commit.
required_env() { echo "VERCEL_DEPLOY_HOOK_URL DEPLOY_URL"; }

deploy() {
  code="$(curl -sS -o /dev/stderr -w '%{http_code}' -X POST "$VERCEL_DEPLOY_HOOK_URL")"
  [[ "$code" == 2* ]] || { echo "deploy hook returned HTTP $code" >&2; return 1; }
  echo "${DEPLOY_URL%/}"
}
