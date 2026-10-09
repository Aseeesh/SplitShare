import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { prisma } from "@/lib/db/client";

import { maxUploadBytes, receiptPathname, validateReceipt } from "./validate";

/**
 * Receipt storage on Cloudflare R2.
 *
 * Receipts are financial documents — a bill with an address on it, a card
 * receipt — so they must never be world-readable. R2 buckets are private by
 * default and only reachable through the Worker binding, which is a stronger
 * guarantee than the old Vercel-Blob `access: "private"` flag: there is no
 * public URL at all. Reads go through `app/api/receipts/[fileId]/route.ts`,
 * which re-checks household membership on every request.
 *
 * Provider split modeled on `src/lib/email/send.ts`: the R2 binding is used
 * whenever a Cloudflare context exists (the deployed worker, `wrangler dev`,
 * `opennextjs-cloudflare preview`); plain `next dev` has no binding, so it
 * falls back to `.receipts/` on disk. The store is resolved per call rather
 * than at module scope, because the worker module evaluates before any
 * request exists and a cached "no binding" would be permanent.
 *
 * The `file_uploads` row and the object are written in that order on purpose:
 * a row with no object renders as a broken receipt, which is recoverable,
 * whereas an object with no row is unreferenced garbage nobody will ever find.
 */

export interface StoredReceipt {
  fileId: string;
  pathname: string;
  contentType: string;
  sizeBytes: number;
}

interface ReceiptStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    contentType: string | null;
  } | null>;
  del(key: string): Promise<void>;
}

function r2Store(): ReceiptStore | null {
  try {
    const bucket = getCloudflareContext().env.RECEIPTS;
    if (!bucket) {
      return null;
    }
    return {
      put: (key, bytes, contentType) =>
        bucket.put(key, bytes, { httpMetadata: { contentType } }).then(() => undefined),
      get: async (key) => {
        const object = await bucket.get(key);
        if (!object || !("body" in object)) {
          return null;
        }
        return {
          body: object.body,
          contentType: object.httpMetadata?.contentType ?? null,
        };
      },
      del: (key) => bucket.delete(key).then(() => undefined),
    };
  } catch {
    return null;
  }
}

/**
 * Local fallback under `.receipts/` (gitignored). `node:fs` is imported
 * dynamically so the worker bundle never evaluates it: workerd only ever
 * reaches this module through the R2 branch above.
 */
function fsStore(): ReceiptStore {
  return {
    put: async (key, bytes) => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const path = `.receipts/${key}`;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
    get: async (key) => {
      const { readFile } = await import("node:fs/promises");
      const { Readable } = await import("node:stream");
      try {
        const bytes = await readFile(`.receipts/${key}`);
        return {
          body: Readable.toWeb(Readable.from(bytes)) as ReadableStream<Uint8Array>,
          contentType: null,
        };
      } catch {
        return null;
      }
    },
    del: async (key) => {
      const { unlink } = await import("node:fs/promises");
      await unlink(`.receipts/${key}`).catch(() => undefined);
    },
  };
}

function store(): ReceiptStore {
  return r2Store() ?? fsStore();
}

export async function uploadReceipt(options: {
  householdId: string;
  uploadedByUserId: string;
  bytes: Uint8Array;
  declaredContentType: string;
}): Promise<StoredReceipt> {
  const validated = validateReceipt({
    bytes: options.bytes,
    declaredContentType: options.declaredContentType,
    maxBytes: maxUploadBytes(process.env.MAX_UPLOAD_BYTES),
  });

  const fileId = globalThis.crypto.randomUUID();
  const pathname = receiptPathname(options.householdId, fileId, validated.extension);

  await store().put(pathname, options.bytes, validated.contentType);

  try {
    await prisma.fileUpload.create({
      data: {
        id: fileId,
        householdId: options.householdId,
        uploadedByUserId: options.uploadedByUserId,
        // The API path, not a storage URL: the read route resolves the object
        // from `pathname` through the binding, and a URL pointing at a
        // provider would outlive the provider.
        url: `/api/receipts/${fileId}`,
        pathname,
        contentType: validated.contentType,
        sizeBytes: validated.sizeBytes,
      },
    });
  } catch (error) {
    // Nothing references this object, so leaving it would be a permanent orphan.
    await store()
      .del(pathname)
      .catch(() => undefined);
    throw error;
  }

  return {
    fileId,
    pathname,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
  };
}

export async function getReceiptObject(
  pathname: string,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string | null } | null> {
  return store().get(pathname);
}

export async function deleteReceipt(pathname: string): Promise<void> {
  return store().del(pathname);
}
