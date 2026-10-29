import { expect, type Page } from "@playwright/test";

import type { FixtureGroup } from "./fixtures";
import { query } from "./helpers";

export type Method = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
const LABEL: Record<Method, string> = {
  EQUAL: "Equally",
  EXACT: "Exact amounts",
  PERCENTAGE: "Percentages",
  SHARES: "Shares",
};

export interface FormInput {
  description: string;
  amount: string;
  method?: Method;
  /** Person name -> weight text (exact amount / percent / shares). */
  weights?: Record<string, string>;
  /** Names to untick (everybody is ticked by default). */
  exclude?: string[];
  receipt?: { name: string; mimeType: string; buffer: Buffer };
}

export function row(page: Page, label: string) {
  return page.locator("li").filter({ has: page.locator("label", { hasText: label }) });
}

/** Opens the add form and fills it; does not submit. `viewer` is shown as "You". */
export async function fillExpenseForm(
  page: Page,
  group: FixtureGroup,
  viewer: string,
  input: FormInput,
): Promise<void> {
  await page.goto(`/households/${group.id}/expenses/new`);
  await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
  await page.getByPlaceholder("Groceries").fill(input.description);
  await page.getByPlaceholder("59.41").fill(input.amount);
  if (input.method && input.method !== "EQUAL") {
    await page.getByRole("button", { name: LABEL[input.method], exact: true }).click();
  }
  for (const name of input.exclude ?? []) {
    await row(page, name === viewer ? "You" : name)
      .getByRole("checkbox")
      .uncheck();
  }
  for (const [name, w] of Object.entries(input.weights ?? {})) {
    await row(page, name === viewer ? "You" : name)
      .getByRole("textbox")
      .fill(w);
  }
  if (input.receipt)
    await page.locator('input[type="file"]').setInputFiles(input.receipt);
}

export async function submitExpense(page: Page, group: FixtureGroup): Promise<void> {
  const btn = page.getByRole("button", { name: "Add expense" });
  await expect(btn).toBeEnabled();
  await btn.click();
  await page.waitForURL(new RegExp(`/households/${group.id}$`));
}

export async function createViaUi(
  page: Page,
  group: FixtureGroup,
  viewer: string,
  input: FormInput,
): Promise<string> {
  await fillExpenseForm(page, group, viewer, input);
  await submitExpense(page, group);
  return (await expenseByDescription(group, input.description)).id;
}

export interface ExpenseRow {
  id: string;
  status: string;
  amount_cents: string;
  split_method: string;
  reverses_expense_id: string | null;
  paid_by_user_id: string;
  receipt_file_id: string | null;
}

export async function expenseByDescription(
  group: FixtureGroup,
  description: string,
): Promise<ExpenseRow> {
  const rows = await query<ExpenseRow>(
    `SELECT * FROM expenses WHERE household_id=$1 AND description=$2
      ORDER BY created_at DESC`,
    [group.id, description],
  );
  expect(rows.length, `expense "${description}" exists`).toBeGreaterThan(0);
  return rows[0]!;
}

/** user name -> cents, for one expense. */
export async function splitsOf(
  group: FixtureGroup,
  expenseId: string,
): Promise<Record<string, number>> {
  const rows = await query<{ name: string; amount_cents: string }>(
    `SELECT u.name, s.amount_cents FROM expense_splits s JOIN users u ON u.id=s.user_id
      WHERE s.expense_id=$1`,
    [expenseId],
  );
  void group;
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.amount_cents)]));
}

export async function acceptanceOf(expenseId: string): Promise<Record<string, string>> {
  const rows = await query<{ name: string; acceptance: string }>(
    `SELECT u.name, s.acceptance FROM expense_splits s JOIN users u ON u.id=s.user_id
      WHERE s.expense_id=$1`,
    [expenseId],
  );
  return Object.fromEntries(rows.map((r) => [r.name, r.acceptance]));
}

export async function auditActions(group: FixtureGroup): Promise<string[]> {
  const rows = await query<{ action: string }>(
    "SELECT action FROM audit_logs WHERE household_id=$1 ORDER BY created_at",
    [group.id],
  );
  return rows.map((r) => r.action);
}

export async function removeMember(group: FixtureGroup, name: string): Promise<void> {
  await query(
    "UPDATE household_members SET removed_at=now() WHERE household_id=$1 AND user_id=$2",
    [group.id, group.people[name]!.id],
  );
}

/** Smallest valid JPEG (1x1). */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
