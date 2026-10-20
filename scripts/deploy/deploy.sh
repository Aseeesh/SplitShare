#!/usr/bin/env bash
# Deploy to a hosting target. The workflow knows nothing about any provider:
# it calls this with a target name, and each target lives in targets/<name>.sh.
#
#   scripts/deploy/deploy.sh vercel
#   scripts/deploy/deploy.sh cloudflare
#
# To add a provider, drop in targets/<name>.sh that defines `required_env`
# (names it needs) and `deploy` (prints the production URL on its last line).
set -euo pipefail

target="${1:?usage: deploy.sh <target>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
file="$here/targets/$target.sh"

if [[ ! -f "$file" ]]; then
  echo "error: unknown deploy target '$target'. Available: $(ls "$here/targets" | sed 's/\.sh$//' | tr '\n' ' ')" >&2
  exit 2
fi

# shellcheck source=/dev/null
source "$file"

missing=()
for name in $(required_env); do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if (( ${#missing[@]} > 0 )); then
  echo "error: target '$target' needs: ${missing[*]}" >&2
  exit 3
fi

url="$(deploy | tail -n 1)"
echo "deployed: $url"
[[ -z "${GITHUB_OUTPUT:-}" ]] || echo "url=$url" >> "$GITHUB_OUTPUT"
