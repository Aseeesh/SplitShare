import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/profile/profile-form";
import { Card } from "@/components/ui/card";
import { getOptionalUser } from "@/lib/auth/guards";
import { listHouseholds } from "@/lib/households/queries";

export const metadata: Metadata = { title: "Your profile" };

/** Each user manages their own profile and sees only their own households. */
export default async function ProfilePage() {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/signin");
  }
  const households = await listHouseholds();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
          <p className="text-sm">{user.email}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Name</p>
          <ProfileForm initialName={user.name ?? ""} />
        </div>
        {user.isSuperUser ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You are a super user.{" "}
            <Link href="/admin" className="underline">
              Open the console
            </Link>
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold tracking-tight">Your households</h2>
        <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
          {households.map((household) => (
            <li key={household.id} className="py-2 text-sm">
              <Link
                href={`/households/${household.id}/history`}
                className="hover:underline"
              >
                {household.name}
              </Link>
              <span className="ml-2 text-xs text-slate-500">{household.role}</span>
            </li>
          ))}
          {households.length === 0 ? (
            <li className="py-2 text-sm text-slate-500">No households yet.</li>
          ) : null}
        </ul>
      </Card>
    </main>
  );
}
