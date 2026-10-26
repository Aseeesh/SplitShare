"use client";

import { Card } from "@/components/ui/card";
import type { PersonSuggestion } from "@/lib/overview/queries";

import { NewGroupForm } from "./new-group-form";

/** The "create a group" card on the households page. */
export function CreateHousehold({ people }: { people: PersonSuggestion[] }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">Create a group</h2>
      <NewGroupForm people={people} />
    </Card>
  );
}
