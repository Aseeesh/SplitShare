import { AppShell } from "@/components/layout/app-shell";
import { signOut } from "@/lib/auth";
import { getOptionalUser } from "@/lib/auth/guards";

/**
 * The authenticated app shell.
 *
 * Wraps every page that belongs to the signed-in experience (dashboard and
 * households) with the global top bar + hamburger drawer. Auth pages
 * (`/signin`), invite acceptance and the API routes stay outside this group, so
 * they render without the chrome.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getOptionalUser();

  return (
    <AppShell
      user={user}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      {children}
    </AppShell>
  );
}
