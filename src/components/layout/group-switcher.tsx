"use client";

import { Check, ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";

import { loadSwitcher } from "@/actions/households/switcher";
import { NewGroupForm } from "@/components/households/new-group-form";
import { RoleBadge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { HouseholdSummary } from "@/lib/households/queries";
import { formatSignedMoney } from "@/lib/money";
import type { PersonSuggestion } from "@/lib/overview/queries";
import { balanceToneClass } from "@/lib/ui/status";

type Loaded =
  | { state: "idle" | "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; groups: HouseholdSummary[]; people: PersonSuggestion[] };

/**
 * The title in a household's header, which opens a "Switch group" sheet: every
 * group with your role and balance, tap one to jump to it, or start a new one
 * with people you already know.
 *
 * The list is fetched when the sheet opens rather than with every page, so
 * pages that never use it pay nothing.
 */
export function GroupSwitcher({
  currentId,
  currentName,
}: {
  currentId: string;
  currentName: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "new">("list");
  const [loaded, setLoaded] = useState<Loaded>({ state: "idle" });

  const close = useCallback(() => setOpen(false), []);

  async function show() {
    setView("list");
    setOpen(true);
    setLoaded({ state: "loading" });
    const result = await loadSwitcher();
    setLoaded(
      result.ok
        ? { state: "ready", ...result.data }
        : { state: "error", message: result.message },
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={show}
        className="-mx-2 flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-left hover:bg-slate-100 active:scale-[0.99] dark:hover:bg-slate-800"
      >
        <span className="truncate text-base font-semibold tracking-tight">
          {currentName}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
        <span className="sr-only">Switch group</span>
      </button>

      <BottomSheet open={open} onClose={close} titleId={titleId}>
        {view === "new" ? (
          <>
            <div className="flex items-center gap-2 pb-3">
              <button
                type="button"
                aria-label="Back to groups"
                onClick={() => setView("list")}
                className="-ml-2 flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="size-5" />
              </button>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                New group
              </h2>
            </div>
            <NewGroupForm
              people={loaded.state === "ready" ? loaded.people : []}
              onOpened={close}
            />
          </>
        ) : (
          <>
            <h2 id={titleId} className="pb-3 text-lg font-semibold tracking-tight">
              Switch group
            </h2>

            {loaded.state === "ready" ? (
              <ul className="space-y-1">
                {loaded.groups.map((group) => {
                  const current = group.id === currentId;
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() => {
                          close();
                          if (!current) {
                            router.push(`/households/${group.id}`);
                          }
                        }}
                        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors active:scale-[0.99] ${
                          current
                            ? "bg-emerald-50 dark:bg-emerald-950"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="bg-brand/15 text-brand-strong flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold">
                          {group.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {group.name}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <RoleBadge role={group.role} />
                            {group.memberCount}{" "}
                            {group.memberCount === 1 ? "member" : "members"}
                          </span>
                        </span>
                        {current ? (
                          <Check
                            aria-label="Current group"
                            className="text-brand size-5 shrink-0"
                          />
                        ) : (
                          <span
                            className={`font-mono text-sm font-medium ${balanceToneClass(group.yourNetCents)}`}
                          >
                            {formatSignedMoney(group.yourNetCents, group.currency)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : loaded.state === "error" ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {loaded.message}
              </p>
            ) : (
              <div aria-busy="true" className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setView("new")}
              className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <Plus className="size-5" />
              </span>
              Create a new group
            </button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
