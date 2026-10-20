import "server-only";

import { requireHouseholdMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { fromDbCents } from "@/lib/money";

import { loadDebtMatrix } from "./load";
import { pairPositions, type PairPosition } from "./pairwise";

export interface NamedPairPosition extends PairPosition {
  name: string;
  /** An offset between you and them is already waiting on a confirmation. */
  pendingOffsetReference: string | null;
  /** You proposed it, so only they can confirm. */
  pendingOffsetIsYours: boolean;
}

export interface OffsetProposal {
  reference: string;
  fromName: string;
  amountCents: number;
}

export interface PairLedger {
  positions: NamedPairPosition[];
  /** Offsets other people proposed that the viewer (or a placeholder they manage) can confirm. */
  proposalsForYou: OffsetProposal[];
}

/** Offset references look like `offset:<groupId>:<proposerUserId>`. */
export function parseOffsetReference(
  reference: string | null,
): { groupId: string; proposerId: string } | null {
  const match = /^offset:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(reference ?? "");
  return match ? { groupId: match[1]!, proposerId: match[2]! } : null;
}

export async function getPairLedger(householdId: string): Promise<PairLedger> {
  const membership = await requireHouseholdMember(householdId);
  const viewerId = membership.userId;

  const [matrix, pending] = await Promise.all([
    loadDebtMatrix(householdId),
    prisma.payment.findMany({
      where: {
        householdId,
        method: "OFFSET",
        confirmation: { is: null },
        reversedBy: { is: null },
      },
      select: {
        reference: true,
        fromUserId: true,
        toUserId: true,
        amountCents: true,
        fromUser: { select: { name: true, email: true } },
      },
    }),
  ]);

  const positions = pairPositions(matrix, viewerId);
  const ids = positions.map((p) => p.otherUserId);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  const proposals = new Map<string, OffsetProposal>();
  const pendingByOther = new Map<string, { reference: string; mine: boolean }>();
  for (const p of pending) {
    const parsed = parseOffsetReference(p.reference);
    if (!parsed || !p.reference) continue;
    const involvesViewer = p.fromUserId === viewerId || p.toUserId === viewerId;
    if (!involvesViewer) continue;
    const other = p.fromUserId === viewerId ? p.toUserId : p.fromUserId;
    pendingByOther.set(other, {
      reference: p.reference,
      mine: parsed.proposerId === viewerId,
    });
    // The proposer's own leg is the one that names them.
    if (parsed.proposerId !== viewerId && p.fromUserId === parsed.proposerId) {
      proposals.set(p.reference, {
        reference: p.reference,
        fromName: p.fromUser.name ?? p.fromUser.email,
        amountCents: fromDbCents(p.amountCents, "offset amount"),
      });
    }
  }

  return {
    positions: positions.map((position) => {
      const waiting = pendingByOther.get(position.otherUserId);
      return {
        ...position,
        name: nameOf.get(position.otherUserId) ?? "Member",
        pendingOffsetReference: waiting?.reference ?? null,
        pendingOffsetIsYours: waiting?.mine ?? false,
      };
    }),
    proposalsForYou: [...proposals.values()],
  };
}
