/**
 * Per-spec fixtures. Each call creates brand-new users and a brand-new group with
 * unique names, so specs never depend on the shared seed and several can run at
 * once against one database. Never reseed from a spec: it TRUNCATEs everything.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import type { Page } from "@playwright/test";

type Role = "ADMIN" | "MEMBER" | "VIEWER";

export interface FixturePerson {
  id: string;
  name: string;
  email: string;
  token: string;
}

export interface FixtureGroup {
  id: string;
  name: string;
  people: Record<string, FixturePerson>;
}

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

/** `members` maps a first name to a role; the first ADMIN creates the group. */
export async function createGroup(
  members: Record<string, Role>,
  opts: { currency?: string; requireAcceptance?: boolean } = {},
): Promise<FixtureGroup> {
  const creator = Object.entries(members).find(([, role]) => role === "ADMIN")?.[0];
  if (!creator) throw new Error("createGroup needs at least one ADMIN");

  const tag = randomUUID().slice(0, 8);
  const people: Record<string, FixturePerson> = {};
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const name of Object.keys(members)) {
      const id = randomUUID();
      const email = `${name.toLowerCase()}.${tag}@example.test`;
      const token = `e2e-${tag}-${name.toLowerCase()}`;
      await client.query(
        `INSERT INTO users (id, name, email, email_verified, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [id, name, email],
      );
      await client.query(
        `INSERT INTO sessions (id, session_token, user_id, expires)
         VALUES ($1, $2, $3, now() + interval '7 days')`,
        [randomUUID(), token, id],
      );
      people[name] = { id, name, email, token };
    }
    const id = randomUUID();
    const name = `Group ${tag}`;
    await client.query(
      `INSERT INTO households (id, name, currency, created_by_user_id, require_acceptance, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [
        id,
        name,
        opts.currency ?? "NZD",
        people[creator]!.id,
        opts.requireAcceptance ?? true,
      ],
    );
    for (const [n, role] of Object.entries(members)) {
      await client.query(
        `INSERT INTO household_members (id, household_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), id, people[n]!.id, role],
      );
    }
    await client.query("COMMIT");
    return { id, name, people };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function signInAsPerson(page: Page, person: FixturePerson): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: person.token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** A brand-new super user (`users.is_super_user`) with a live session and no group. */
export async function createSuperUser(name = "Root"): Promise<FixturePerson> {
  const tag = randomUUID().slice(0, 8);
  const id = randomUUID();
  const email = `${name.toLowerCase()}.${tag}@example.test`;
  const token = `e2e-${tag}-${name.toLowerCase()}`;
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, is_super_user, updated_at)
       VALUES ($1, $2, $3, now(), true, now())`,
      [id, name, email],
    );
    await client.query(
      `INSERT INTO sessions (id, session_token, user_id, expires)
       VALUES ($1, $2, $3, now() + interval '7 days')`,
      [randomUUID(), token, id],
    );
  } finally {
    await client.end();
  }
  return { id, name, email, token };
}
