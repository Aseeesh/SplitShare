"use client";

import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import type { PersonSuggestion } from "@/lib/overview/queries";

export interface PickedPerson {
  email: string;
  /** What to show on the chip: a name for people you know, the address otherwise. */
  label: string;
  known: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_OPTIONS = 6;

type Option =
  { kind: "known"; person: PersonSuggestion } | { kind: "new"; email: string };

/**
 * Autocomplete for adding people to a group.
 *
 * Typing matches against `people`, which the server limits to those who share a
 * current group with the viewer, with the names of the groups you share shown
 * beside each. Anyone else is added by typing a full email address, which is
 * how a brand-new person gets invited. Picked people become removable chips.
 */
export function PeoplePicker({
  people,
  value,
  onChange,
  disabled = false,
}: {
  people: PersonSuggestion[];
  value: PickedPerson[];
  onChange: (next: PickedPerson[]) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const text = query.trim().toLowerCase();
    const picked = new Set(value.map((v) => v.email.toLowerCase()));
    const known: Option[] = people
      .filter((p) => !picked.has(p.email.toLowerCase()))
      .filter(
        (p) =>
          text === "" ||
          p.email.toLowerCase().includes(text) ||
          (p.name ?? "").toLowerCase().includes(text),
      )
      .slice(0, MAX_OPTIONS)
      .map((person) => ({ kind: "known", person }));

    const exact = people.some((p) => p.email.toLowerCase() === text) || picked.has(text);
    if (EMAIL.test(text) && !exact) {
      known.push({ kind: "new", email: text });
    }
    return known;
  }, [people, query, value]);

  const showList = focused && options.length > 0;
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  function pick(option: Option) {
    const next: PickedPerson =
      option.kind === "known"
        ? {
            email: option.person.email,
            label: option.person.name ?? option.person.email,
            known: true,
          }
        : { email: option.email, label: option.email, known: false };
    onChange([...value, next]);
    setQuery("");
    setActive(0);
  }

  return (
    <div>
      {value.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((person) => (
            <li
              key={person.email}
              className="flex items-center gap-1 rounded-full bg-emerald-50 py-1 pr-1 pl-3 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
            >
              {person.label}
              {person.known ? null : (
                <span className="rounded-full bg-emerald-200 px-1.5 text-[10px] dark:bg-emerald-800">
                  new
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${person.label}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v.email !== person.email))}
                className="flex size-6 items-center justify-center rounded-full hover:bg-emerald-200 dark:hover:bg-emerald-800"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        value={query}
        disabled={disabled}
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        placeholder={
          people.length > 0
            ? "Search people you know, or type an email"
            : "Type an email address"
        }
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && options.length > 0) {
            event.preventDefault();
            setActive((activeIndex + 1) % options.length);
          } else if (event.key === "ArrowUp" && options.length > 0) {
            event.preventDefault();
            setActive((activeIndex - 1 + options.length) % options.length);
          } else if (event.key === "Enter" && showList) {
            event.preventDefault();
            pick(options[activeIndex]);
          } else if (event.key === "Escape" && showList) {
            // Close the list only, not the sheet around it.
            event.stopPropagation();
            setFocused(false);
          }
        }}
        className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
      />

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {options.map((option, index) => {
            const isNew = option.kind === "new";
            const title = isNew
              ? option.email
              : (option.person.name ?? option.person.email);
            const detail = isNew
              ? "New person: you’ll get a link to send them"
              : `${option.person.email} · Also in ${option.person.sharedHouseholds.join(", ")}`;
            return (
              <li
                key={isNew ? option.email : option.person.userId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown, not click: the input's blur would otherwise close
                // the list before the click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
                className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 ${
                  index === activeIndex ? "bg-slate-100 dark:bg-slate-800" : ""
                }`}
              >
                <span className="bg-brand/15 text-brand-strong flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {isNew ? "+" : title.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {isNew ? `Invite ${title}` : title}
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
