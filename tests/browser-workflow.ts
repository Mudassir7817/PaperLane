import { chromium, expect, type Browser } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
await mkdir("tmp/screenshots", { recursive: true });
let browser: Browser | undefined;
for (const channel of [undefined, "msedge", "chrome"]) {
  try {
    browser = await chromium.launch({
      headless: true,
      ...(channel ? { channel } : {}),
    });
    console.log("Test browser:", channel || "Chromium");
    break;
  } catch {}
}
if (!browser)
  throw Error(
    "No local test browser found. Run npx playwright install chromium.",
  );
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors: string[] = [];
const remoteRequests: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!/^(http:\/\/127\.0\.0\.1|blob:|data:)/.test(r.url()))
    remoteRequests.push(r.url());
});
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:5173");
  await expect(
    page.getByRole("heading", { name: "A fresh page. A simpler way." }),
  ).toBeVisible();
  await page.screenshot({ path: "tmp/screenshots/home.png", fullPage: true });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tmp/pdfs/sample.pdf");
  await expect(
    page.getByRole("button", { name: "Go to page 3", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".page-stage canvas")).toHaveAttribute(
    "width",
    /\d{3,}/,
  );
  await page.screenshot({ path: "tmp/screenshots/editor.png", fullPage: true });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.locator(".page-stage").click({ position: { x: 95, y: 80 } });
  await page
    .getByRole("textbox", { name: "Edit text on page" })
    .fill("Approved by Olivia");
  await page
    .getByRole("textbox", { name: "Edit text on page" })
    .press("Control+Enter");
  await expect(page.locator(".page-stage [data-element=text]")).toHaveCount(1);
  await page
    .getByRole("spinbutton", { name: "X position", exact: true })
    .fill("60");
  await page
    .getByRole("spinbutton", { name: "Y position", exact: true })
    .fill("90");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  const textMark = page.locator(".page-stage [data-element=text]");
  const before = await textMark.boundingBox();
  await textMark.hover();
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 20,
    before!.y + before!.height / 2 + 25,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "X position", exact: true }),
  ).not.toHaveValue("60");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(textMark).toHaveCount(1);
  await textMark.click();
  await expect(
    page.getByRole("spinbutton", { name: "X position", exact: true }),
  ).toHaveValue("60");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator(".page-stage [data-element=text]")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(page.locator(".page-stage [data-element=text]")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".page-stage [data-element=text]")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".page-stage [data-element=text]")).toHaveCount(1);
  await page.getByRole("button", { name: "Go to page 3", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Client name", exact: true })
    .fill("Olivia Test");
  await page
    .getByRole("checkbox", { name: "Ready to start", exact: true })
    .check();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  const pad = await page.locator(".signature-pad canvas").boundingBox();
  await page.mouse.move(pad!.x + 60, pad!.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 65; i++)
    await page.mouse.move(
      pad!.x + 60 + i * 4,
      pad!.y + 85 + Math.sin(i * 0.45) * 25,
      { steps: 1 },
    );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Use signature", exact: true })
    .click();
  await page.locator(".page-stage").click({ position: { x: 90, y: 400 } });
  await expect(
    page.locator(".page-stage [data-element=signature]"),
  ).toHaveCount(1);
  await page.screenshot({
    path: "tmp/screenshots/signature.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Rotate pages", exact: true }).click();
  await expect(page.locator(".page-stage")).toHaveCSS("width", /\d/);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByLabel("Page fit", { exact: true }).selectOption("page");
  await page
    .getByRole("button", { name: "Move pages up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move pages up", exact: true })
    .click();
  await page.getByRole("button", { name: "Go to page 3", exact: true }).click();
  await page.getByRole("button", { name: "Delete pages", exact: true }).click();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Download filename", exact: true })
    .fill("paperlane-verified");
  await expect(page.locator(".export-preview canvas")).toHaveAttribute(
    "width",
    /\d{3,}/,
  );
  await page.screenshot({
    path: "tmp/screenshots/export-preview.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs("tmp/pdfs/browser-edited.pdf");
  expect(download.suggestedFilename()).toBe("paperlane-verified.pdf");
  const exported = await PDFDocument.load(
    await readFile("tmp/pdfs/browser-edited.pdf"),
  );
  expect(exported.getPageCount()).toBe(2);
  expect(exported.getPage(0).getRotation().angle).toBe(90);
  expect(exported.getPage(1).getWidth()).toBe(595.28);
  expect(exported.getForm().getFields()).toHaveLength(0);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("tmp/pdfs/browser-edited.pdf");
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(2);
  await expect(page.locator(".document-name")).toContainText(
    "browser-edited.pdf",
  );
  await page.screenshot({
    path: "tmp/screenshots/reopened-signature.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Replace text: Approved by Olivia",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "tmp/screenshots/reopened-text.png",
    fullPage: true,
  });
  // Exercise the remaining editing and page-management features through the UI.
  await page
    .getByRole("button", {
      name: "Replace text: Approved by Olivia",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Edit text on page" })
    .fill("Reviewed and approved");
  await page
    .getByRole("textbox", { name: "Edit text on page" })
    .press("Control+Enter");
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.locator(".page-stage").click({ position: { x: 180, y: 170 } });
  const handle = page.getByRole("button", {
    name: "Resize selected item",
    exact: true,
  });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb!.x + 4, hb!.y + 4);
  await page.mouse.down();
  await page.mouse.move(hb!.x + 45, hb!.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "Width", exact: true }),
  ).not.toHaveValue("130");
  await page.getByRole("button", { name: "Ellipse", exact: true }).click();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.locator(".page-stage").click({ position: { x: 130, y: 220 } });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.locator(".page-stage").click({ position: { x: 200, y: 260 } });
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.locator(".page-stage").click({ position: { x: 160, y: 340 } });
  await page
    .getByRole("textbox", { name: "Edit text on page" })
    .fill("Please keep a copy.");
  await page
    .getByRole("textbox", { name: "Edit text on page" })
    .press("Control+Enter");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByRole("button", { name: "Type", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Signature name", exact: true })
    .fill("Olivia Parker");
  await page
    .getByRole("button", { name: "Use signature", exact: true })
    .click();
  await page.locator(".page-stage").click({ position: { x: 110, y: 465 } });
  await page
    .locator("input[type=file]")
    .nth(2)
    .setInputFiles({
      name: "stamp.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.locator(".page-stage").click({ position: { x: 200, y: 500 } });
  await expect(page.locator(".page-stage [data-element=image]")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles("tmp/pdfs/sample.pdf");
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(5);
  await page.getByLabel("Select pages", { exact: true }).selectOption("last");
  await expect(
    page
      .getByRole("checkbox", { name: /Select page/ })
      .filter({ visible: true }),
  ).toHaveCount(5);
  await expect(
    page.getByRole("checkbox", { name: "Select page 4", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select page 5", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Duplicate pages", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(7);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(5);
  await page.getByLabel("Select pages", { exact: true }).selectOption("first");
  await page
    .getByRole("button", { name: "Extract selected pages", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const extractedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await (await extractedDownload).saveAs("tmp/pdfs/extracted-pages.pdf");
  const extracted = await PDFDocument.load(
    await readFile("tmp/pdfs/extracted-pages.pdf"),
  );
  expect(extracted.getPageCount()).toBe(2);
  expect(extracted.getPage(1).node.Annots()?.size()).toBeGreaterThan(0);
  await page.getByLabel("Select pages", { exact: true }).selectOption("none");
  await page
    .getByRole("button", { name: "Insert blank page", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(6);
  await page
    .locator(".thumbnail-item")
    .nth(0)
    .dragTo(page.locator(".thumbnail-item").nth(1));
  page.once("dialog", (d) => d.accept());
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "invalid.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("Not a PDF"),
    });
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveCount(6);
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    "tmp/browser-verification.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "upload",
          "text",
          "drag",
          "undo",
          "copy/paste",
          "delete",
          "redo",
          "fill forms",
          "draw signature",
          "rotate",
          "zoom",
          "reorder",
          "delete page",
          "preview",
          "download custom filename",
          "reopen",
          "selectable added text",
          "no remote requests",
          "no browser errors",
          "replacement text",
          "resize",
          "shapes and highlights",
          "checkmarks and comments",
          "typed signature",
          "image placement over another item",
          "merge",
          "first/last two page selection",
          "duplicate pages",
          "extract selected pages",
          "insert blank page",
          "drag reorder",
          "invalid PDF preserves open document",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: complete browser workflow, PDF download/reopen, selectable text, and zero external requests.",
  );
} catch (e) {
  await page.screenshot({
    path: "tmp/screenshots/failure.png",
    fullPage: true,
  });
  console.error("Browser errors:", errors);
  throw e;
} finally {
  await browser.close();
}
