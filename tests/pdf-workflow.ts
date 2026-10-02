import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { createSample, exportPdf } from "../src/pdf";
import type { EditorState, Mark, Page, Source } from "../src/types";
import { textLines } from "../src/textLayout";

await mkdir("tmp/pdfs", { recursive: true });
const bytes = await createSample();
await writeFile("tmp/pdfs/sample.pdf", bytes);
const source: Source = { id: "sample", name: "Sample.pdf", bytes };
const original = await PDFDocument.load(bytes);
assert.equal(original.getPageCount(), 3);
const pages: Page[] = original.getPages().map((p, index) => ({
  id: `p${index}`,
  source: source.id,
  index,
  width: p.getWidth(),
  height: p.getHeight(),
  originX: 0,
  originY: 0,
  rotation: 0,
  elements: [],
}));
const text: Mark = {
  id: "text",
  kind: "text",
  x: 60,
  y: 100,
  w: 250,
  h: 36,
  text: "Workflow verified",
  size: 18,
  font: "sans",
  color: "#183f32",
  background: "transparent",
  align: "left",
  bold: false,
};
pages[0].elements.push(text);
// Small valid PNG signature fixture; browser tests additionally draw a real signature.
const signature: Mark = {
  ...text,
  id: "signature",
  kind: "signature",
  x: 90,
  y: 220,
  w: 160,
  h: 60,
  data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
};
pages[0].elements.push(signature);
pages[2].rotation = 90;
const state: EditorState = {
  pages: [pages[2], pages[0]],
  fields: {
    "sample:Client name": "Olivia Test",
    "sample:Ready to start": true,
  },
};
const sources = new Map([[source.id, source]]);
const output = await exportPdf(state, sources);
await writeFile("tmp/pdfs/workflow-edited.pdf", output);
const reopened = await PDFDocument.load(output);
assert.equal(reopened.getPageCount(), 2);
assert.equal(reopened.getPage(0).getRotation().angle, 90);
assert.equal(reopened.getPage(1).getWidth(), 595.28);
assert.equal(reopened.getPage(1).getHeight(), 841.89);
assert.equal(reopened.getForm().getFields().length, 0);
const content = (doc: PDFDocument, index: number) => {
  const contents = doc.getPage(index).node.Contents();
  if (!contents) return "";
  const refs = "asArray" in contents ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const stream = doc.context.lookup(ref);
      return stream instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")
        : "";
    })
    .join("\n");
};
const stream = content(reopened, 1);
assert.match(stream, /576F726B666C6F77207665726966696564/);
const baseline = stream.match(/1 0 0 1 64 ([\d.]+) Tm/);
assert.ok(baseline);
assert.ok(Math.abs(Number(baseline[1]) - 721.69) < 0.001);
assert.match(stream, /1 0 0 1 90 561\.89 cm/);
assert.match(stream, /160 0 0 60 0 0 cm/);
const resources = reopened.getPage(1).node.Resources()!;
assert.ok(resources.lookup(PDFName.of("XObject")));
const extracted = await PDFDocument.load(
  await exportPdf(state, sources, ["p0"]),
);
assert.equal(extracted.getPageCount(), 1);
assert.match(content(extracted, 0), /576F726B666C6F77207665726966696564/);
const extra = await PDFDocument.create();
const cropped = extra.addPage([500, 700]);
cropped.setCropBox(25, 40, 400, 600);
const extraBytes = await extra.save();
sources.set("extra", { id: "extra", bytes: extraBytes, name: "extra.pdf" });
const inserted: Page = {
  id: "extra-page",
  source: "extra",
  index: 0,
  width: 400,
  height: 600,
  originX: 25,
  originY: 40,
  rotation: 270,
  elements: [{ ...text, x: 20, y: 30 }],
};
const merged = await PDFDocument.load(
  await exportPdf(
    {
      ...state,
      pages: [...state.pages, inserted, { ...pages[0], id: "duplicate" }],
    },
    sources,
  ),
);
assert.equal(merged.getPageCount(), 4);
assert.deepEqual(merged.getPage(2).getCropBox(), {
  x: 25,
  y: 40,
  width: 400,
  height: 600,
});
assert.equal(merged.getPage(2).getRotation().angle, 270);
assert.match(content(merged, 2), /49 589\.8 Tm/);
assert.equal(
  (await PDFDocument.load(bytes))
    .getForm()
    .getTextField("Client name")
    .getText(),
  undefined,
);
assert.ok(
  textLines({
    ...text,
    text: "A long sentence should wrap consistently in the editor and the exported PDF.",
    w: 120,
  }).length > 2,
);
await assert.rejects(
  () =>
    exportPdf(
      {
        ...state,
        pages: [
          { ...pages[0], elements: [{ ...text, text: "Unsupported: 中文" }] },
        ],
      },
      sources,
    ),
  /unsupported/,
);
console.log(
  "PASS: 3-page PDF creation; text and signature export; page reorder/delete/rotate/duplicate; merge; extraction; crop coordinates; form flattening; immutable original; text wrapping; unsupported character error.",
);
