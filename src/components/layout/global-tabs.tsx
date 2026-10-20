"use client";

import { usePathname } from "next/navigation";
import { Home, ShieldCheck, User, Users } from "lucide-react";

import { TabBar, type TabItem } from "./tab-bar";

/**
 * App-level bottom tabs (mobile). Inside a household the household bar takes
 * over, so this stays out of its way rather than stacking two fixed bars.
 */
export function GlobalTabs({ isSuperUser }: { isSuperUser: boolean }) {
  const pathname = usePathname();
  if (/^\/households\/[^/]+/.test(pathname)) {
    return null;
  }

  const items: TabItem[] = [
    { href: "/", label: "Overview", icon: Home, exact: true },
    { href: "/households", label: "Groups", icon: Users, exact: true },
    { href: "/profile", label: "Profile", icon: User },
    ...(isSuperUser ? [{ href: "/admin", label: "Console", icon: ShieldCheck }] : []),
  ];

  return <TabBar items={items} pathname={pathname} group="global" label="App" />;
}
