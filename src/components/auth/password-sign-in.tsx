/** Email + password sign-in. A plain form POST, so it works before hydration. */
export function PasswordSignIn({ redirectTo }: { redirectTo: string }) {
  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900";
  return (
    <form method="POST" action="/api/password-login" className="mt-6 space-y-3">
      <input type="hidden" name="callbackUrl" value={redirectTo} />
      <label className="block text-xs text-slate-600 dark:text-slate-400">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username webauthn"
          required
          className={`${input} mt-1`}
        />
      </label>
      <label className="block text-xs text-slate-600 dark:text-slate-400">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`${input} mt-1`}
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        Sign in with email
      </button>
      <p className="text-xs text-slate-500">
        No password yet? Sign in with Google once, then set one on your profile.
      </p>
    </form>
  );
}
