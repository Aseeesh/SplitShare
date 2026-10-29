/**
 * Creates a fresh two-person group (Ann admin, Bob member) in the E2E database and
 * prints their session tokens, so a person (or Claude in Chrome) can sign in to the
 * LOCAL test app without Google by setting the `authjs.session-token` cookie.
 * Usage: E2E_DATABASE_URL=... EMAIL_TO=you@gmail.com pnpm tsx scripts/testing/demo-group.ts
 */
import { createGroup } from "../../tests/e2e/support/fixtures";

const emailTo = process.env.EMAIL_TO;
createGroup(
  { Ann: "ADMIN", Bob: "MEMBER" },
  { requireAcceptance: false, ...(emailTo ? { emailTo } : {}) },
).then((g) => {
  console.log(
    JSON.stringify({
      groupId: g.id,
      name: g.name,
      Ann: { token: g.people.Ann!.token, email: g.people.Ann!.email },
      Bob: { token: g.people.Bob!.token, email: g.people.Bob!.email },
    }),
  );
  process.exit(0);
});
