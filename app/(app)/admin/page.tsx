import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HouseholdToggle } from "@/components/admin/household-toggle";
import { LimitInput } from "@/components/admin/limit-input";
import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { UserToggle } from "@/components/admin/user-toggle";
import { Card } from "@/components/ui/card";
import {
  listAllHouseholds,
  listAllUsers,
  listPermissionOverrides,
  listPlatformAudit,
} from "@/lib/admin/queries";
import { getPlatformLimits } from "@/lib/platform/limits";
import { getOptionalUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Super user console" };

/**
 * Platform-wide view: every household and every user. Non-super users get a 404
 * rather than a 403, so the console's existence is not advertised.
 */
export default async function AdminPage() {
  const viewer = await getOptionalUser();
  if (!viewer?.isSuperUser) {
    notFound();
  }
  const [households, users, limits, overrides, auditTrail] = await Promise.all([
    listAllHouseholds(),
    listAllUsers(),
    getPlatformLimits(),
    listPermissionOverrides(),
    listPlatformAudit(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Super user console</h1>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Platform limits</h2>
        <LimitInput
          label="Households per admin"
          value={limits.maxHouseholdsPerAdmin}
          target={{
            type: "platformHouseholds",
            otherValue: limits.maxMembersPerHousehold,
          }}
        />
        <LimitInput
          label="Members per household"
          value={limits.maxMembersPerHousehold}
          target={{ type: "platformMembers", otherValue: limits.maxHouseholdsPerAdmin }}
        />
        <p className="text-xs text-slate-500">
          Defaults for everyone. Override one admin or one household below.
        </p>
      </Card>

      <PermissionMatrix overrides={overrides} />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Households ({households.length})</h2>
        </div>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {households.map((h) => (
            <li key={h.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/households/${h.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {h.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {h.memberCount} members · {h.expenseCount} expenses · {h.currency}
                    {h.status !== "ACTIVE" ? ` · ${h.status.toLowerCase()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/households/${h.id}/members`}
                    className="text-xs underline"
                  >
                    Members
                  </Link>
                  {h.status === "ARCHIVED" ? null : (
                    <HouseholdToggle householdId={h.id} status={h.status} />
                  )}
                </div>
              </div>
              <LimitInput
                label="Member limit"
                value={h.maxMembersOverride}
                placeholder={String(limits.maxMembersPerHousehold)}
                allowClear
                target={{ type: "household", householdId: h.id }}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Users ({users.length})</h2>
        </div>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {users.map((u) => (
            <li key={u.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.name ?? u.email}
                    {u.isSuperUser ? " · super user" : ""}
                    {u.disabledAt ? " · suspended" : ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email} ·{" "}
                    {u.households.length === 0
                      ? "no households"
                      : u.households.map((h) => `${h.name} (${h.role})`).join(", ")}
                  </p>
                </div>
                {u.isSuperUser || u.id === viewer.id ? null : (
                  <UserToggle userId={u.id} disabled={u.disabledAt !== null} />
                )}
              </div>
              <LimitInput
                label="Household limit"
                value={u.maxHouseholdsOverride}
                placeholder={String(limits.maxHouseholdsPerAdmin)}
                allowClear
                target={{ type: "user", userId: u.id }}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Recent platform changes</h2>
        </div>
        {auditTrail.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {auditTrail.map((row) => (
              <li key={row.id} className="px-4 py-2.5">
                <p className="text-sm font-medium">
                  {row.action.replaceAll("_", " ").toLowerCase()}
                </p>
                <p className="truncate font-mono text-xs text-slate-500">{row.summary}</p>
                <p className="text-xs text-slate-500">
                  {row.actorName ?? "ops cli"} · {row.createdAt.toLocaleString("en-NZ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
