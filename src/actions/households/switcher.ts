"use server";

import { ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { listHouseholds, type HouseholdSummary } from "@/lib/households/queries";
import { listKnownPeople, type PersonSuggestion } from "@/lib/overview/queries";

/**
 * Everything the switch-group sheet needs, loaded when it is opened rather than
 * on every household page (§26: fewer queries per page). Both reads are scoped
 * to the caller: their own groups, and only people who share one of them.
 */
export async function loadSwitcher(): Promise<
  ActionResult<{ groups: HouseholdSummary[]; people: PersonSuggestion[] }>
> {
  try {
    const [groups, people] = await Promise.all([listHouseholds(), listKnownPeople()]);
    return ok({ groups, people });
  } catch (error) {
    return toActionResult(error);
  }
}
