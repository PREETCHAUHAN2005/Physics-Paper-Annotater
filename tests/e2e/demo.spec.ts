import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const paper = "1. A resistor has resistance 5 ohm in a circuit.\n2. Find the focal length of a convex lens.\n3. A capacitor stores charge in a dielectric.";
test("outside paper -> suggestions -> review -> export -> reload", async ({ page }) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Jobs & Upload" })).toBeVisible();
  await page.getByLabel("Choose physics papers", { exact: true }).setInputFiles({ name: "outside-physics.txt", mimeType: "text/plain", buffer: Buffer.from(paper) });
  await expect(page.getByTestId("question-count")).toHaveText("3 questions detected");
  await page.getByRole("button", { name: "Create 1 paper job", exact: true }).click();
  await expect(page.getByText("outside-physics.txt", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Run pipeline", exact: true }).first().click();
  await page.getByRole("button", { name: "Run pipeline", exact: true }).click();
  await page.getByRole("button", { name: "Run now", exact: true }).click();
  await expect(page.getByText("3 / 3 units routed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review Queue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept all", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(page.getByText("3 / 3 reviewed", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const records = JSON.parse(Buffer.concat(chunks).toString());
  expect(records).toHaveLength(3);
  expect(records[0].chapter).toBe("Current Electricity");
  expect(records[0].annotation_engine).toBe("rules-v1");
  await page.reload();
  await expect(page.getByText("outside-physics.txt", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
});

test("extracts a real two-page PDF and preserves page boundaries", async ({ page }) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage();
  first.drawText("1. A resistor has resistance 5 ohm in a circuit.", { x: 45, y: 750, size: 12, font });
  first.drawText("2. A convex lens forms an image at its focal length.", { x: 45, y: 720, size: 12, font });
  const second = pdf.addPage();
  second.drawText("1. A capacitor stores charge with a dielectric between plates.", { x: 45, y: 750, size: 12, font });
  await page.goto("/");
  await page.getByLabel("Choose physics papers", { exact: true }).setInputFiles({ name: "external-paper.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByTestId("question-count")).toHaveText("3 questions detected");
  await expect(page.getByLabel("Extracted text: external-paper.pdf")).toHaveValue(/A capacitor/);
  const preview = await page.getByLabel("Extracted text: external-paper.pdf").inputValue();
  expect(preview).toContain("\f");
  await page.getByRole("button", { name: "Create 1 paper job", exact: true }).click();
  await expect(page.getByText("external-paper.pdf", { exact: true }).first()).toBeVisible();
});

test("rejects more than three selected papers without partial import", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose physics papers", { exact: true }).setInputFiles([1,2,3,4].map((n) => ({ name: "paper-" + n + ".txt", mimeType: "text/plain", buffer: Buffer.from(paper) })));
  await expect(page.getByRole("alert")).toContainText("at most 3 papers");
  await expect(page.getByTestId("question-count")).toHaveCount(0);
});
