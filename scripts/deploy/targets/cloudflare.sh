# Cloudflare Workers target (OpenNext + wrangler). Kept so the app can move
# back without rewriting the pipeline: set the repo variable DEPLOY_TARGET to
# `cloudflare`.
required_env() { echo "CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID DATABASE_URL AUTH_SECRET"; }

deploy() {
  pnpm exec opennextjs-cloudflare build >&2
  pnpm exec wrangler deploy >&2
  echo "${DEPLOY_URL:-${NEXT_PUBLIC_APP_URL:-https://split-share.ashishrijal.com.np}}"
}
