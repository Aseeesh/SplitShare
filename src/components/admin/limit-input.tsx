"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  setHouseholdMemberLimit,
  setPlatformLimits,
  setUserHouseholdLimit,
} from "@/actions/admin/platform";
import type { ActionResult } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";

/** What a field edits. Plain data, so a Server Component can pass it to this one. */
export type LimitTarget =
  | { type: "platformHouseholds"; otherValue: number }
  | { type: "platformMembers"; otherValue: number }
  | { type: "user"; userId: string }
  | { type: "household"; householdId: string };

function save(target: LimitTarget, value: number | null): Promise<ActionResult<null>> {
  switch (target.type) {
    case "platformHouseholds":
      return setPlatformLimits({
        maxHouseholdsPerAdmin: value,
        maxMembersPerHousehold: target.otherValue,
      });
    case "platformMembers":
      return setPlatformLimits({
        maxHouseholdsPerAdmin: target.otherValue,
        maxMembersPerHousehold: value,
      });
    case "user":
      return setUserHouseholdLimit({ userId: target.userId, maxHouseholds: value });
    case "household":
      return setHouseholdMemberLimit({
        householdId: target.householdId,
        maxMembers: value,
      });
  }
}

/**
 * A number field with Save. Blank means "no override": it clears back to the
 * platform default, which is what a null value expresses.
 */
export function LimitInput({
  label,
  value,
  placeholder,
  allowClear = false,
  target,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  allowClear?: boolean;
  target: LimitTarget;
}) {
  const router = useRouter();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    const parsed = text.trim() === "" ? null : Number(text);
    startTransition(async () => {
      const result = await save(target, parsed);
      setMessage(result.ok ? "Saved" : result.message);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-slate-600 dark:text-slate-400">{label}</label>
      <input
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value.replace(/\D/g, ""))}
        className="min-h-11 w-24 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
      <Button
        variant="secondary"
        disabled={isPending || (!allowClear && text.trim() === "")}
        onClick={submit}
      >
        {isPending ? "…" : "Save"}
      </Button>
      {message ? (
        <span role="status" className="text-xs text-slate-500">
          {message}
        </span>
      ) : null}
    </div>
  );
}
