import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserToggle } from "@/components/admin/user-toggle";
import { Card } from "@/components/ui/card";
import { listAllHouseholds, listAllUsers } from "@/lib/admin/queries";
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
  const [households, users] = await Promise.all([listAllHouseholds(), listAllUsers()]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Super user console</h1>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Households ({households.length})</h2>
        </div>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {households.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/households/${h.id}`}
                  className="truncate font-medium hover:underline"
                >
                  {h.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {h.memberCount} members · {h.expenseCount} expenses · {h.currency}
                </p>
              </div>
              <Link href={`/households/${h.id}/members`} className="text-xs underline">
                Members
              </Link>
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
            <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
