"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createHousehold } from "@/actions/households/create";
import { inviteMember } from "@/actions/households/invite";
import { InviteLink } from "@/components/members/invite-link";
import { PeoplePicker, type PickedPerson } from "@/components/members/people-picker";
import { Button } from "@/components/ui/button";
import type { PersonSuggestion } from "@/lib/overview/queries";

const CURRENCIES = ["NZD", "USD", "AUD", "EUR", "GBP"];

interface Created {
  householdId: string;
  links: Array<{ url: string; email: string }>;
  failures: string[];
}

/**
 * Creates a group and, in the same go, invites the people picked for it: known
 * people from the viewer's own groups, or brand-new ones by email address.
 *
 * Creating comes first and invitations follow one by one, so a failed invite
 * never undoes the group; it is reported and can be retried from the members
 * page.
 */
export function NewGroupForm({
  people,
  onOpened,
}: {
  people: PersonSuggestion[];
  /** Called just before navigating into the new group, e.g. to close a sheet. */
  onOpened?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NZD");
  const [picked, setPicked] = useState<PickedPerson[]>([]);
  // Quick mode by default: nobody has to accept a share before it counts.
  const [requireAcceptance, setRequireAcceptance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [isPending, startTransition] = useTransition();

  function open(householdId: string) {
    onOpened?.();
    router.push(`/households/${householdId}`);
    router.refresh();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createHousehold({ name, currency, requireAcceptance });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const { householdId } = result.data;

      const links: Created["links"] = [];
      const failures: string[] = [];
      for (const person of picked) {
        const invite = await inviteMember({ householdId, email: person.email });
        if (invite.ok) {
          links.push({ url: invite.data.acceptUrl, email: person.email });
        } else {
          failures.push(`${person.label}: ${invite.message}`);
        }
      }

      if (picked.length === 0) {
        open(householdId);
        return;
      }
      setCreated({ householdId, links, failures });
    });
  }

  if (created) {
    return (
      <div>
        <p
          role="status"
          className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          “{name}” is ready.
        </p>
        {created.links.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Share these links so people can join. If you lose one, use “New link” under
              Members.
            </p>
            {created.links.map((link) => (
              <InviteLink key={link.email} url={link.url} email={link.email} />
            ))}
          </>
        ) : null}
        {created.failures.length > 0 ? (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            Not invited: {created.failures.join(" ")} Retry from the Members tab.
          </p>
        ) : null}
        <Button className="mt-4 w-full" onClick={() => open(created.householdId)}>
          Open group
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          data-autofocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Group name"
          placeholder="Group name, e.g. Trip to Queenstown"
          maxLength={100}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          aria-label="Currency"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
        Add people (optional)
      </p>
      <PeoplePicker
        people={people}
        value={picked}
        onChange={setPicked}
        disabled={isPending}
      />

      <label className="mt-4 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={requireAcceptance}
          onChange={(event) => setRequireAcceptance(event.target.checked)}
          className="accent-brand mt-0.5 size-4"
        />
        <span>
          Everyone must accept their share before it counts. Leave off for a simple,
          Splitwise-style group. You can change this later.
        </span>
      </label>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <Button
        onClick={submit}
        disabled={isPending || name.trim() === ""}
        className="mt-4 w-full"
      >
        {isPending
          ? "Creating…"
          : picked.length > 0
            ? `Create and invite ${picked.length}`
            : "Create group"}
      </Button>
    </div>
  );
}
