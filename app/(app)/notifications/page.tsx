import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotificationList } from "@/components/notifications/notification-list";
import { getOptionalUser } from "@/lib/auth/guards";
import { listMyNotifications } from "@/lib/notifications/queries";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  if (!(await getOptionalUser())) {
    redirect("/signin");
  }
  const items = await listMyNotifications();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <NotificationList items={items} />
    </main>
  );
}
