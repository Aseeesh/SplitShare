import "server-only";

import { prisma } from "@/lib/db/client";

import { maxUploadBytes, validateReceipt } from "./validate";

/**
 * Receipt storage in Postgres.
 *
 * Receipts are financial documents — a bill with an address on it, a card
 * receipt — so they must never be world-readable. There is no public URL and
 * no public bucket: the bytes live in `file_uploads.data` and are served only
 * through `app/api/receipts/[fileId]/route.ts`, which re-checks household
 * membership on every request.
 *
 * Keeping the bytes in the row puts the receipt and its metadata in one place
 * (no object-store drift) at the cost of database size. For a household app
 * receiving a handful of ≤10 MB receipts that is the right trade-off, and it
 * removes the R2 dependency entirely. `data` is never selected in list
 * queries — see the comment on the `FileUpload` model.
 */

export interface StoredReceipt {
  fileId: string;
  contentType: string;
  sizeBytes: number;
}

export async function uploadReceipt(options: {
  householdId: string;
  uploadedByUserId: string;
  bytes: Uint8Array<ArrayBuffer>;
  declaredContentType: string;
}): Promise<StoredReceipt> {
  const validated = validateReceipt({
    bytes: options.bytes,
    declaredContentType: options.declaredContentType,
    maxBytes: maxUploadBytes(process.env.MAX_UPLOAD_BYTES),
  });

  const fileId = globalThis.crypto.randomUUID();

  await prisma.fileUpload.create({
    data: {
      id: fileId,
      householdId: options.householdId,
      uploadedByUserId: options.uploadedByUserId,
      // The API path, not a storage URL: the read route re-checks membership
      // on every request, and a URL pointing at a provider would outlive it.
      url: `/api/receipts/${fileId}`,
      contentType: validated.contentType,
      sizeBytes: validated.sizeBytes,
      data: options.bytes,
    },
  });

  return {
    fileId,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
  };
}

export async function getReceiptBytes(
  fileId: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string | null } | null> {
  const file = await prisma.fileUpload.findUnique({
    where: { id: fileId },
    select: { data: true, contentType: true },
  });

  if (!file) {
    return null;
  }

  return { bytes: file.data, contentType: file.contentType };
}

export async function deleteReceipt(fileId: string): Promise<void> {
  await prisma.fileUpload.delete({ where: { id: fileId } }).catch(() => undefined);
}
