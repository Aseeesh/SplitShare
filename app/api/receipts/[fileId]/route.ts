import { assertBelongsToHousehold, requireHouseholdMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { getReceiptBytes } from "@/lib/storage";

/**
 * Serves a receipt.
 *
 * Receipt bytes live in Postgres with no public URL, so this is the only way
 * to read one — and it re-runs the §2.4 guard chain on every request rather
 * than trusting an unguessable file id. Membership is checked against the
 * household the file belongs to, so knowing a file id is not enough.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/receipts/[fileId]">,
) {
  const { fileId } = await params;

  const file = await prisma.fileUpload.findUnique({
    where: { id: fileId },
    select: { householdId: true, contentType: true },
  });

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  try {
    // (b) membership, then (d) the file belongs to that household.
    await requireHouseholdMember(file.householdId);
    assertBelongsToHousehold(file, file.householdId);
  } catch {
    // Deliberately 404, not 403: distinguishing them would confirm that a file
    // id is real to someone who cannot see it.
    return new Response("Not found", { status: 404 });
  }

  // Null when the row has no bytes — a `file_uploads` row can outlive its
  // receipt, which is the recoverable direction of that inconsistency.
  const result = await getReceiptBytes(fileId);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.bytes, {
    headers: {
      "Content-Type": result.contentType ?? file.contentType,
      // Private to this viewer, and never stored by a shared cache.
      "Cache-Control": "private, max-age=3600, no-transform",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
