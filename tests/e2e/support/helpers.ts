import { Client } from "pg";
import type { Page } from "@playwright/test";

import { SESSION_TOKENS, type Person } from "../tokens";

export async function signInAs(page: Page, who: Person): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: SESSION_TOKENS[who],
      url: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function householdIdByName(name: string): Promise<string> {
  const rows = await query<{ id: string }>("SELECT id FROM households WHERE name = $1", [
    name,
  ]);
  if (!rows[0]) throw new Error(`seed household "${name}" not found`);
  return rows[0].id;
}

export async function userIdByName(name: string): Promise<string> {
  const rows = await query<{ id: string }>("SELECT id FROM users WHERE name = $1", [
    name,
  ]);
  if (!rows[0]) throw new Error(`seed user "${name}" not found`);
  return rows[0].id;
}
