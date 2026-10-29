/**
 * Per-spec fixtures. Each call creates brand-new users and a brand-new group with
 * unique names, so specs never depend on the shared seed and several can run at
 * once against one database. Never reseed from a spec: it TRUNCATEs everything.
 */
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import type { Page } from "@playwright/test";

import { PrismaClient } from "../../../src/generated/prisma-node/client";

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

let client: PrismaClient | undefined;
function db(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.E2E_DATABASE_URL }),
  });
  return client;
}

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

/** `members` maps a first name to a role; the first ADMIN creates the group. */
export async function createGroup(
  members: Record<string, Role>,
  opts: { currency?: string; requireAcceptance?: boolean } = {},
): Promise<FixtureGroup> {
  const prisma = db();
  const tag = randomUUID().slice(0, 8);
  const people: Record<string, FixturePerson> = {};
  for (const name of Object.keys(members)) {
    const email = `${name.toLowerCase()}.${tag}@example.test`;
    const user = await prisma.user.create({
      data: { name, email, emailVerified: new Date() },
    });
    const token = `e2e-${tag}-${name.toLowerCase()}`;
    await prisma.session.create({
      data: {
        sessionToken: token,
        userId: user.id,
        expires: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    people[name] = { id: user.id, name, email, token };
  }
  const creator = Object.entries(members).find(([, role]) => role === "ADMIN")?.[0];
  if (!creator) throw new Error("createGroup needs at least one ADMIN");
  const name = `Group ${tag}`;
  const household = await prisma.household.create({
    data: {
      name,
      currency: opts.currency ?? "NZD",
      requireAcceptance: opts.requireAcceptance ?? true,
      createdByUserId: people[creator]!.id,
      members: {
        create: Object.entries(members).map(([n, role]) => ({
          userId: people[n]!.id,
          role,
        })),
      },
    },
  });
  return { id: household.id, name, people };
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
