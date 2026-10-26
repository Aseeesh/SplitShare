"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { inviteMember } from "@/actions/households/invite";
import { addPlaceholderMember } from "@/actions/households/placeholders";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { PersonSuggestion } from "@/lib/overview/queries";

import { InviteLink } from "./invite-link";
import { PeoplePicker, type PickedPerson } from "./people-picker";

/**
 * The two ways to add somebody.
 *
 * "Track someone" is deliberately first and explained, because it is the one
 * people want and the less obvious of the two: it covers the flatmate who will
 * never sign up. Their shares count immediately, since there is nobody to
 * accept them (§8a).
 */
export function AddMember({
  householdId,
  people,
}: {
  householdId: string;
  people: PersonSuggestion[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"tracked" | "invite">("tracked");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<PickedPerson[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Array<{ url: string; email: string }>>([]);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setMessage(null);
    setLinks([]);
    startTransition(async () => {
      if (mode === "tracked") {
        const result = await addPlaceholderMember({ householdId, name });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setName("");
        setMessage("Added. Their share of new expenses counts straight away.");
        router.refresh();
        return;
      }

      // One at a time: each invite is its own audited, rate-limited action.
      const sent: Array<{ url: string; email: string }> = [];
      const failed: string[] = [];
      for (const person of picked) {
        const result = await inviteMember({ householdId, email: person.email });
        if (result.ok) {
          sent.push({ url: result.data.acceptUrl, email: person.email });
        } else {
          failed.push(`${person.label}: ${result.message}`);
        }
      }
      setLinks(sent);
      // Anyone whose invite failed stays picked so it can be retried.
      setPicked((current) =>
        current.filter((person) => !sent.some((s) => s.email === person.email)),
      );
      if (failed.length > 0) {
        setError(failed.join(" "));
      }
      if (sent.length > 0) {
        setMessage(
          sent.length === 1
            ? "Invitation created. Share the link below."
            : `${sent.length} invitations created. Share each link below.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={mode === "tracked" ? "primary" : "secondary"}
          onClick={() => setMode("tracked")}
        >
          Track someone
        </Button>
        <Button
          type="button"
          variant={mode === "invite" ? "primary" : "secondary"}
          onClick={() => setMode("invite")}
        >
          Invite by email
        </Button>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {mode === "tracked"
          ? "For someone who will not sign up. You accept and confirm on their behalf, and their share counts as soon as you add an expense."
          : "They sign in with Google and accept their own shares. Nothing counts toward balances until they do."}
      </p>

      {mode === "tracked" ? (
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            maxLength={60}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <Button onClick={submit} disabled={isPending || name.trim() === ""}>
            {isPending ? "…" : "Add"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <PeoplePicker
            people={people}
            value={picked}
            onChange={setPicked}
            disabled={isPending}
          />
          <Button
            onClick={submit}
            disabled={isPending || picked.length === 0}
            className="w-full"
          >
            {isPending
              ? "…"
              : picked.length > 1
                ? `Invite ${picked.length} people`
                : "Invite"}
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
      {links.map((link) => (
        <InviteLink key={link.email} url={link.url} email={link.email} />
      ))}
    </Card>
  );
}
