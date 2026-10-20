"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inviteMember } from "@/actions/households/invite";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { PersonSuggestion } from "@/lib/overview/queries";

/** People you have shared a group with before, one tap from an invitation. */
export function SuggestedPeople({
  householdId,
  people,
}: {
  householdId: string;
  people: PersonSuggestion[];
}) {
  const router = useRouter();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (people.length === 0) {
    return null;
  }

  function invite(person: PersonSuggestion) {
    setError(null);
    setPendingId(person.userId);
    startTransition(async () => {
      const result = await inviteMember({ householdId, email: person.email });
      setPendingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent((current) => new Set(current).add(person.userId));
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="People you may want to add" />
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        <AnimatePresence initial={false}>
          {people.map((person) => (
            <motion.li
              key={person.userId}
              layout
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="bg-brand/15 text-brand-strong flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                {(person.name ?? person.email).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {person.name ?? person.email}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  Also in {person.sharedHouseholds.join(", ")}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={sent.has(person.userId) || pendingId === person.userId}
                onClick={() => invite(person)}
              >
                {sent.has(person.userId)
                  ? "Invited"
                  : pendingId === person.userId
                    ? "…"
                    : "Invite"}
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
