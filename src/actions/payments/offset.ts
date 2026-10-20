"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { writeAuditLog } from "@/lib/audit/write";
import { requireAuth, requireCanActFor, requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { loadDebtMatrix } from "@/lib/ledger/load";
import { offsetProposalCutoff, parseOffsetReference } from "@/lib/ledger/queries";
import { toDbCents, fromDbCents } from "@/lib/money";
import { createNotifications } from "@/lib/notifications/create";
import { allocateConfirmedPayment } from "@/lib/payments/allocate";

const proposeSchema = z.object({ householdId: z.uuid(), withUserId: z.uuid() });
const confirmSchema = z.object({ householdId: z.uuid(), reference: z.string().min(1) });

/** How much of what two members owe each other can be cancelled, from the books. */
async function cancellableBetween(
  householdId: string,
  a: string,
  b: string,
): Promise<number> {
  const matrix = await loadDebtMatrix(householdId);
  const aOwesB = Math.max(matrix.get(a)?.get(b) ?? 0, 0);
  const bOwesA = Math.max(matrix.get(b)?.get(a) ?? 0, 0);
  return Math.min(aOwesB, bOwesA);
}

/**
 * Proposes cancelling what two members owe each other.
 *
 * If A owes B 50 from one expense and B owes A 30 from another, 30 of each can
 * be struck out, leaving A owing B 20. That is written as TWO payments of 30
 * (A→B and B→A, method OFFSET) so the immutable ledger shows exactly what was
 * cancelled and nothing is edited. Net balances do not move — the offset only
 * clears the overlap between the two of them.
 *
 * The amount is computed here from the books; the client sends only who. The
 * other person must confirm (see `confirmOffset`), because it changes the
 * record between them.
 */
export async function proposeOffset(
  input: unknown,
): Promise<ActionResult<{ reference: string; amountCents: number }>> {
  try {
    const data = proposeSchema.parse(input);
    const membership = await requireCapability(data.householdId, "RECORD_OWN_PAYMENT");
    const actor = await requireAuth();

    if (data.withUserId === membership.userId) {
      return fail("VALIDATION", "Pick somebody else.");
    }

    // §2.4(d): the other person must be a current member of this household.
    const other = await prisma.householdMember.findFirst({
      where: { householdId: data.householdId, userId: data.withUserId, removedAt: null },
      select: { user: { select: { isPlaceholder: true } } },
    });
    if (!other) {
      return fail("WRONG_HOUSEHOLD", "That person is not a member of this household.");
    }

    const amount = await cancellableBetween(
      data.householdId,
      membership.userId,
      data.withUserId,
    );
    if (amount <= 0) {
      return fail(
        "CONFLICT",
        "Nothing to cancel: you do not owe each other at the same time.",
      );
    }

    const waiting = await prisma.payment.findFirst({
      where: {
        householdId: data.householdId,
        method: "OFFSET",
        confirmation: { is: null },
        // An expired proposal no longer blocks a fresh one.
        paidAt: { gt: offsetProposalCutoff() },
        OR: [
          { fromUserId: membership.userId, toUserId: data.withUserId },
          { fromUserId: data.withUserId, toUserId: membership.userId },
        ],
      },
      select: { id: true },
    });
    if (waiting) {
      return fail("CONFLICT", "There is already a cancel-out waiting to be confirmed.");
    }

    const groupId = globalThis.crypto.randomUUID();
    const reference = `offset:${groupId}:${membership.userId}`;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const legs = [
        { from: membership.userId, to: data.withUserId },
        { from: data.withUserId, to: membership.userId },
      ];
      for (const leg of legs) {
        const payment = await tx.payment.create({
          data: {
            householdId: data.householdId,
            fromUserId: leg.from,
            toUserId: leg.to,
            amountCents: toDbCents(amount, "offset amount"),
            currency: membership.currency,
            method: "OFFSET",
            reference,
            note: "Cancelled against what they owe each other",
            paidAt: now,
          },
          select: { id: true },
        });
        await writeAuditLog(tx, {
          householdId: data.householdId,
          actorUserId: membership.userId,
          action: "PAYMENT_CREATED",
          entityType: "payment",
          entityId: payment.id,
          after: { method: "OFFSET", amountCents: amount, reference },
        });
      }

      if (!other.user.isPlaceholder) {
        const household = await tx.household.findUniqueOrThrow({
          where: { id: data.householdId },
          select: { name: true },
        });
        await createNotifications(tx, {
          householdId: data.householdId,
          context: {
            actorName: actor.name ?? actor.email ?? "Someone",
            householdName: household.name,
            amountCents: amount,
            currency: membership.currency,
          },
          targets: [
            {
              userId: data.withUserId,
              type: "PAYMENT_RECEIVED",
              entityType: "household",
              entityId: data.householdId,
            },
          ],
        });
      }
    });

    revalidatePath(`/households/${data.householdId}/payments`);
    return ok({ reference, amountCents: amount });
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Confirms a cancel-out, applying BOTH legs together.
 *
 * Only the person who did not propose it (or their manager, for a placeholder)
 * may confirm. Confirming one leg alone would move balances, so there is no way
 * to do that: ordinary confirmation refuses OFFSET payments. The amount is
 * re-checked against today's books first, so debts that changed in between
 * (a reversal, another payment) cannot be cancelled by a stale proposal.
 */
export async function confirmOffset(input: unknown): Promise<ActionResult<null>> {
  try {
    const data = confirmSchema.parse(input);
    await requireCapability(data.householdId, "CONFIRM_PAYMENT_RECEIVED");
    const actor = await requireAuth();

    const parsed = parseOffsetReference(data.reference);
    if (!parsed) {
      return fail("VALIDATION", "That is not a cancel-out.");
    }

    const legs = await prisma.payment.findMany({
      where: {
        householdId: data.householdId,
        method: "OFFSET",
        reference: data.reference,
      },
      select: {
        id: true,
        householdId: true,
        fromUserId: true,
        toUserId: true,
        amountCents: true,
        paidAt: true,
        confirmation: { select: { id: true } },
      },
    });

    // §2.4(d) — an unknown or foreign reference reads as missing.
    if (legs.length !== 2) {
      return fail("WRONG_HOUSEHOLD", "Not found");
    }
    if (legs.some((leg) => leg.confirmation)) {
      return fail("CONFLICT", "That cancel-out has already been confirmed.");
    }

    if (legs.some((leg) => leg.paidAt <= offsetProposalCutoff())) {
      return fail("CONFLICT", "That cancel-out expired. Propose it again.");
    }

    const counterparty = legs.find(
      (leg) => leg.fromUserId !== parsed.proposerId,
    )?.fromUserId;
    if (!counterparty) {
      return fail("VALIDATION", "That is not a cancel-out.");
    }
    await requireCanActFor(actor.id, counterparty, "the person it was proposed to");

    const amount = fromDbCents(legs[0]!.amountCents, "offset amount");
    const stillCancellable = await cancellableBetween(
      data.householdId,
      parsed.proposerId,
      counterparty,
    );
    if (stillCancellable < amount) {
      return fail(
        "CONFLICT",
        "What you owe each other has changed since this was proposed. Propose it again.",
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const leg of legs) {
        await tx.paymentConfirmation.create({
          data: { paymentId: leg.id, confirmedByUserId: actor.id, confirmedAt: now },
        });
        await writeAuditLog(tx, {
          householdId: data.householdId,
          actorUserId: actor.id,
          action: "PAYMENT_CONFIRMED",
          entityType: "payment",
          entityId: leg.id,
          after: { method: "OFFSET", amountCents: amount, reference: data.reference },
        });
        // Each leg pays down the payer's oldest shares owed to the other person,
        // so a cancelled-out debt also settles the expenses behind it.
        await allocateConfirmedPayment(tx, leg, now);
      }
    });

    revalidatePath(`/households/${data.householdId}`);
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}
