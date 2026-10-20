# Vercel target. Remote build (`vercel deploy`), so Vercel-side environment
# variables — including sensitive ones the CLI cannot pull — are available to
# the build, which also runs `prisma migrate deploy` via vercel.json.
required_env() { echo "VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID"; }

deploy() {
  npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" 2>/dev/null | tail -n 1
}
