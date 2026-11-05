"use client";

import { useState, useTransition } from "react";

import { setPassword } from "@/actions/profile/password";

/** Sets, or changes, the signed-in user's own password. */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [done, setDone] = useState(hasPassword);

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword !== String(data.get("confirm") ?? "")) {
      setMessage({ kind: "error", text: "The two passwords do not match." });
      return;
    }
    startTransition(async () => {
      const result = await setPassword({
        currentPassword: done ? String(data.get("currentPassword") ?? "") : undefined,
        newPassword,
      });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      form.reset();
      setDone(true);
      setMessage({
        kind: "ok",
        text: "Password saved. You can now sign in with your email.",
      });
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {done
          ? "Change the password you use to sign in with your email."
          : "Set a password so you can sign in with your email, including in the installed app, then add a passkey."}
      </p>
      {done ? (
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          required
          className={input}
        />
      ) : null}
      <input
        name="newPassword"
        type="password"
        autoComplete="new-password"
        placeholder="New password (10+ characters)"
        minLength={10}
        required
        className={input}
      />
      <input
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder="Repeat new password"
        minLength={10}
        required
        className={input}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-900"
      >
        {pending ? "Saving…" : done ? "Change password" : "Set password"}
      </button>
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "text-xs text-red-700 dark:text-red-300"
              : "text-xs text-emerald-700 dark:text-emerald-300"
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
