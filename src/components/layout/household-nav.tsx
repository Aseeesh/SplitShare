"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, History, Home, Users, Wallet } from "lucide-react";

import { TabBar, type TabItem } from "./tab-bar";

/**
 * Bottom tab bar inside a household. At the bottom because this is a phone app
 * first: in a standalone window there is no browser chrome, and the bottom edge
 * is where a thumb reaches. The first tab leads back out to all households.
 */
export function HouseholdNav({ householdId }: { householdId: string }) {
  const pathname = usePathname();
  const base = `/households/${householdId}`;

  const items: TabItem[] = [
    { href: "/households", label: "All", icon: ArrowLeft, exact: true },
    { href: base, label: "Home", icon: Home, exact: true },
    { href: `${base}/history`, label: "History", icon: History },
    { href: `${base}/payments`, label: "Payments", icon: Wallet },
    { href: `${base}/members`, label: "Members", icon: Users },
  ];

  return <TabBar items={items} pathname={pathname} group="household" label="Household" />;
}
