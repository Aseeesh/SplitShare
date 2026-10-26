"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { setPermissionOverride } from "@/actions/admin/platform";
import { Card, CardHeader } from "@/components/ui/card";
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABELS,
  canWith,
  overrideKey,
  type Capability,
} from "@/lib/auth/permissions";
import type { HouseholdRole } from "@/generated/prisma/enums";

const ROLES: HouseholdRole[] = ["ADMIN", "MEMBER", "VIEWER"];
const LOCKED = new Set(["ADMIN:VIEW_HOUSEHOLD", "ADMIN:MANAGE_MEMBERS"]);

/**
 * What each role may do, editable by the super user. Each cell is a switch;
 * a dot marks a cell that differs from the built-in default. Edits apply to
 * every household on the platform the next time someone makes a request.
 */
export function PermissionMatrix({
  overrides,
}: {
  overrides: Array<{ role: string; capability: string; allowed: boolean }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const saved = new Map(overrides.map((o) => [`${o.role}:${o.capability}`, o.allowed]));
  // Flips the switch the instant it is tapped; React reverts it if the action
  // fails, and the server's value replaces it once the refresh lands.
  const [map, applyOptimistic] = useOptimistic(
    saved,
    (state, change: { key: string; value: boolean | null }) => {
      const next = new Map(state);
      if (change.value === null) {
        next.delete(change.key);
      } else {
        next.set(change.key, change.value);
      }
      return next;
    },
  );

  function toggle(role: HouseholdRole, capability: Capability) {
    // One save at a time, so a double-tap cannot flip a switch back.
    if (isPending) {
      return;
    }
    const current = canWith(role, capability, map);
    const defaultValue = canWith(role, capability, new Map());
    const next = !current;
    // Null removes the override, restoring the built-in default.
    const allowed = next === defaultValue ? null : next;
    setError(null);
    startTransition(async () => {
      applyOptimistic({ key: overrideKey(role, capability), value: allowed });
      const result = await setPermissionOverride({ role, capability, allowed });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Roles & permissions" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Can…</th>
              {ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-center font-medium">
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {ALL_CAPABILITIES.map((capability) => (
              <tr key={capability}>
                <td className="px-4 py-2.5 capitalize">
                  {CAPABILITY_LABELS[capability]}
                </td>
                {ROLES.map((role) => {
                  const on = canWith(role, capability, map);
                  const custom = map.has(overrideKey(role, capability));
                  const locked = LOCKED.has(`${role}:${capability}`);
                  return (
                    <td key={role} className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${role} ${CAPABILITY_LABELS[capability]}`}
                        disabled={locked}
                        onClick={() => toggle(role, capability)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                          on ? "bg-brand" : "bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                            on ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                        {custom ? (
                          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500" />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
