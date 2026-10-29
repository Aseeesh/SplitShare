import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson } from "./support/fixtures";

/**
 * Regression: adding an expense with a phone-sized photo failed because Next caps
 * Server Action bodies at 1MB. Every earlier test used a 1x1 pixel image.
 */

// A valid 1x1 JPEG padded after its end marker to the wanted size. Decoders ignore
// trailing bytes, and the upload check looks at the signature.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const photo = (bytes: number) => Buffer.concat([JPEG, Buffer.alloc(bytes - JPEG.length)]);

async function addWithReceipt(
  page: import("@playwright/test").Page,
  groupId: string,
  buffer: Buffer,
) {
  await page.goto(`/households/${groupId}/expenses/new`);
  await page.getByPlaceholder("Groceries").fill(`Receipt ${buffer.length}`);
  await page.getByPlaceholder("59.41").fill("12.00");
  await page.locator('input[type="file"]').setInputFiles({
    name: "receipt.jpg",
    mimeType: "image/jpeg",
    buffer,
  });
  await page.getByRole("button", { name: "Add expense" }).click();
}

test.describe("§6 receipts of realistic size", () => {
  for (const mb of [2, 3.5]) {
    test(`a ${mb}MB photo is accepted`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "phone", "mutates data; run once");
      const group = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
      await signInAsPerson(page, group.people.Ann!);
      await addWithReceipt(page, group.id, photo(Math.floor(mb * 1024 * 1024)));
      await page.waitForURL(new RegExp(`/households/${group.id}$`), { timeout: 30_000 });
      await expect(
        page.getByText(`Receipt ${Math.floor(mb * 1024 * 1024)}`).first(),
      ).toBeVisible();
    });
  }

  test("a 5MB photo is refused with a clear message, not a crash", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const group = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, group.people.Ann!);
    await addWithReceipt(page, group.id, photo(5 * 1024 * 1024));
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/expenses/new`));
  });
});
