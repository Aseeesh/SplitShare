import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createGroup } from "./support/fixtures";
import { query } from "./support/helpers";

/** Gives a household one audit_logs row, the append-only child that blocks a plain DELETE. */
async function withAudit(householdId: string, actorId: string) {
  await query(
    `INSERT INTO audit_logs (id, household_id, actor_user_id, action, entity_type, entity_id)
     VALUES ($1, $2, $3, 'HOUSEHOLD_CREATED', 'household', $2)`,
    [randomUUID(), householdId, actorId],
  );
}

test.describe("§24 purge only through purge_expired_households", () => {
  test("a raw DELETE on a household that has audit history is rejected", async () => {
    const g = await createGroup({ Ann: "ADMIN" });
    await withAudit(g.id, g.people.Ann!.id);
    await expect(query("DELETE FROM households WHERE id = $1", [g.id])).rejects.toThrow(
      /append-only/,
    );
    expect(await query("SELECT 1 FROM households WHERE id=$1", [g.id])).toHaveLength(1);
    expect(
      await query("SELECT 1 FROM audit_logs WHERE household_id=$1", [g.id]),
    ).toHaveLength(1);
  });

  test("a raw DELETE is rejected even for an ARCHIVED household past retention", async () => {
    const g = await createGroup({ Ann: "ADMIN" });
    await withAudit(g.id, g.people.Ann!.id);
    await query(
      "UPDATE households SET status='ARCHIVED', archived_at = now() - interval '60 days' WHERE id=$1",
      [g.id],
    );
    await expect(query("DELETE FROM households WHERE id = $1", [g.id])).rejects.toThrow(
      /append-only/,
    );
    // And the flag cannot be flipped outside the function by a separate statement.
    await query("SELECT set_config('app.purging_archived','on',false)");
    await expect(query("DELETE FROM households WHERE id = $1", [g.id])).rejects.toThrow(
      /append-only/,
    );
    expect(await query("SELECT 1 FROM households WHERE id=$1", [g.id])).toHaveLength(1);
  });

  test("the purge function removes only ARCHIVED households older than retention", async () => {
    const old = await createGroup({ Ann: "ADMIN" });
    const recent = await createGroup({ Ann: "ADMIN" });
    const active = await createGroup({ Ann: "ADMIN" });
    const suspended = await createGroup({ Ann: "ADMIN" });
    for (const g of [old, recent, active, suspended]) {
      await withAudit(g.id, g.people.Ann!.id);
    }
    await query(
      "UPDATE households SET status='ARCHIVED', archived_at = now() - interval '31 days' WHERE id=$1",
      [old.id],
    );
    await query(
      "UPDATE households SET status='ARCHIVED', archived_at = now() - interval '29 days' WHERE id=$1",
      [recent.id],
    );
    await query(
      "UPDATE households SET status='SUSPENDED', archived_at = NULL WHERE id=$1",
      [suspended.id],
    );

    const out = await query<{ n: number }>("SELECT purge_expired_households(30) AS n");
    expect(out[0]!.n).toBeGreaterThanOrEqual(1);

    expect(await query("SELECT 1 FROM households WHERE id=$1", [old.id])).toHaveLength(0);
    expect(
      await query("SELECT 1 FROM audit_logs WHERE household_id=$1", [old.id]),
    ).toHaveLength(0);
    expect(
      await query("SELECT 1 FROM household_members WHERE household_id=$1", [old.id]),
    ).toHaveLength(0);
    for (const kept of [recent, active, suspended]) {
      expect(await query("SELECT 1 FROM households WHERE id=$1", [kept.id])).toHaveLength(
        1,
      );
    }
    // The flag was transaction-local: afterwards a plain delete is refused again.
    await expect(
      query("DELETE FROM households WHERE id=$1", [recent.id]),
    ).rejects.toThrow(/append-only/);
  });

  test("platform_audit_logs and audit_logs are append-only", async () => {
    const g = await createGroup({ Ann: "ADMIN" });
    await withAudit(g.id, g.people.Ann!.id);
    await expect(
      query("UPDATE audit_logs SET action='HOUSEHOLD_ARCHIVED' WHERE household_id=$1", [
        g.id,
      ]),
    ).rejects.toThrow(/append-only/);
    const id = randomUUID();
    await query(
      `INSERT INTO platform_audit_logs (id, action, entity_type) VALUES ($1, 'E2E_PROBE', 'probe')`,
      [id],
    );
    await expect(
      query("DELETE FROM platform_audit_logs WHERE id=$1", [id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      query("UPDATE platform_audit_logs SET action='X' WHERE id=$1", [id]),
    ).rejects.toThrow(/append-only/);
  });
});
