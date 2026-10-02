import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFName,
  PDFString,
} from "pdf-lib";
import type { EditorState, Source, Mark } from "./types";
import { textLines } from "./textLayout";

const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
export async function exportPdf(
  state: EditorState,
  sources: Map<string, Source>,
  selected?: string[],
) {
  const result = await PDFDocument.create();
  const docs = new Map<string, PDFDocument>();
  for (const p of state.pages.filter(
    (p) => !selected || selected.includes(p.id),
  )) {
    let source = docs.get(p.source);
    if (!source) {
      const src = sources.get(p.source);
      if (!src)
        throw Error(
          "The original document is no longer available. Please open it again.",
        );
      source = await PDFDocument.load(src.bytes.slice());
      const form = source.getForm();
      for (const field of form.getFields()) {
        const value = state.fields[p.source + ":" + field.getName()];
        if (value !== undefined) {
          if (field instanceof PDFTextField) {
            field.setText(String(value));
            const rect = field.acroField.getWidgets()[0]?.getRectangle();
            field.setFontSize(Math.min(16, (rect?.height || 28) * 0.55));
          } else if (field instanceof PDFCheckBox)
            value ? field.check() : field.uncheck();
          else if (
            field instanceof PDFDropdown ||
            field instanceof PDFOptionList ||
            field instanceof PDFRadioGroup
          )
            field.select(String(value));
        }
      }
      if (form.getFields().length) form.flatten();
      docs.set(p.source, source);
    }
    const [page] = await result.copyPages(source, [p.index]);
    result.addPage(page);
    page.setRotation(degrees(p.rotation));
    for (const e of p.elements) {
      const x = p.originX + e.x,
        y = p.originY + p.height - e.y - e.h;
      if (e.kind === "image" || e.kind === "signature") {
        if (e.data) {
          const img = e.data.startsWith("data:image/png")
            ? await result.embedPng(e.data)
            : await result.embedJpg(e.data);
          page.drawImage(img, { x, y, width: e.w, height: e.h });
        }
        continue;
      }
      if (
        e.kind === "highlight" ||
        e.kind === "rectangle" ||
        e.kind === "replacement" ||
        (e.background !== "transparent" && ["text", "comment"].includes(e.kind))
      ) {
        page.drawRectangle({
          x,
          y,
          width: e.w,
          height: e.h,
          color:
            e.kind === "rectangle" && e.background === "transparent"
              ? undefined
              : color(
                  e.kind === "highlight"
                    ? e.color
                    : e.background === "transparent"
                      ? "#ffffff"
                      : e.background,
                ),
          opacity: e.kind === "highlight" ? 0.3 : 1,
          borderColor: e.kind === "rectangle" ? color(e.color) : undefined,
          borderWidth: e.kind === "rectangle" ? 1.5 : 0,
        });
      }
      if (e.kind === "ellipse")
        page.drawEllipse({
          x: x + e.w / 2,
          y: y + e.h / 2,
          xScale: e.w / 2,
          yScale: e.h / 2,
          borderColor: color(e.color),
          borderWidth: 1.5,
          ...(e.background !== "transparent"
            ? { color: color(e.background) }
            : {}),
        });
      if (e.kind === "check") {
        page.drawLine({
          start: { x: x + e.w * 0.12, y: y + e.h * 0.48 },
          end: { x: x + e.w * 0.4, y: y + e.h * 0.2 },
          thickness: Math.max(2, e.w * 0.08),
          color: color(e.color),
        });
        page.drawLine({
          start: { x: x + e.w * 0.4, y: y + e.h * 0.2 },
          end: { x: x + e.w * 0.9, y: y + e.h * 0.85 },
          thickness: Math.max(2, e.w * 0.08),
          color: color(e.color),
        });
      }
      if (["text", "replacement", "comment"].includes(e.kind)) {
        const names = {
          sans: e.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica,
          serif: e.bold
            ? StandardFonts.TimesRomanBold
            : StandardFonts.TimesRoman,
          mono: e.bold ? StandardFonts.CourierBold : StandardFonts.Courier,
        };
        const font = await result.embedFont(names[e.font]);
        const lines = textLines(e);
        try {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineWidth = font.widthOfTextAtSize(line, e.size);
            page.drawText(line, {
              x:
                x +
                (e.align === "center"
                  ? (e.w - lineWidth) / 2
                  : e.align === "right"
                    ? e.w - lineWidth - 4
                    : 4),
              y:
                p.originY +
                p.height -
                e.y -
                4 -
                e.size * 0.9 -
                i * e.size * 1.2,
              size: e.size,
              font,
              color: color(e.color),
            });
          }
        } catch {
          throw Error(
            "Some added text contains characters unsupported by the built-in PDF fonts. Use Latin text, or add a signature/image for other scripts.",
          );
        }
        if (e.kind === "comment") {
          const annotation = result.context.obj({
            Type: "Annot",
            Subtype: "Text",
            Rect: [x, y, x + e.w, y + e.h],
            Contents: PDFString.of(e.text),
            T: PDFString.of("Paperlane"),
            Name: "Comment",
            F: 4,
          });
          const ref = result.context.register(annotation);
          const annots = page.node.Annots();
          if (annots) annots.push(ref);
          else page.node.set(PDFName.of("Annots"), result.context.obj([ref]));
        }
      }
    }
  }
  if (!result.getPageCount())
    throw Error("Select at least one page to download.");
  result.setProducer("Paperlane · locally edited");
  return result.save();
}

export async function createSample() {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const green = rgb(0.1, 0.37, 0.29),
    ink = rgb(0.16, 0.2, 0.19),
    gray = rgb(0.44, 0.48, 0.46);
  const text = (
    p: ReturnType<typeof doc.addPage>,
    str: string,
    x: number,
    y: number,
    size = 11,
    font = regular,
    c = ink,
  ) => p.drawText(str, { x, y, size, font, color: c });
  for (let i = 0; i < 3; i++) {
    const p = doc.addPage([595.28, 841.89]);
    text(p, "N O R T H L I N E", 48, 784, 12, bold, green);
    text(p, "DESIGN STUDIO", 48, 766, 7, regular, gray);
    text(p, "PROJECT PROPOSAL  /  2026", 365, 780, 8, regular, gray);
    p.drawLine({
      start: { x: 48, y: 740 },
      end: { x: 547, y: 740 },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.85),
    });
    if (i === 0) {
      text(p, "Good things start", 48, 675, 38, serif);
      text(p, "with a clear vision.", 48, 631, 38, serif);
      text(p, "Brand identity & website proposal", 48, 590, 13, regular, gray);
      p.drawRectangle({
        x: 48,
        y: 467,
        width: 499,
        height: 77,
        color: rgb(0.94, 0.96, 0.92),
      });
      text(p, "PREPARED FOR", 65, 520, 8, bold, green);
      text(p, "PREPARED BY", 312, 520, 8, bold, green);
      text(p, "Olivia Parker", 65, 495, 13);
      text(p, "Northline Design Studio", 312, 495, 13);
      text(p, "01   A little introduction", 48, 418, 17, bold);
      [
        "Every great brand has a story. We help you tell yours with a thoughtful",
        "visual identity and a website that feels unmistakably you.",
        "",
        "This proposal outlines our approach, the work we will create together,",
        "and a simple plan to bring it all to life.",
      ].forEach((l, j) => text(p, l, 48, 386 - j * 20, 11, regular, gray));
      text(p, "WHAT WE WILL MAKE", 48, 242, 8, bold, green);
      [
        "Brand strategy & creative direction",
        "Visual identity & brand guidelines",
        "Responsive website design",
      ].forEach((l, j) => {
        p.drawCircle({ x: 53, y: 212 - j * 27, size: 2.5, color: green });
        text(p, l, 67, 208 - j * 27, 11);
      });
    } else if (i === 1) {
      text(p, "A thoughtful process.", 48, 675, 36, serif);
      text(p, "02   Scope & timeline", 48, 612, 17, bold);
      [
        [
          "Discover",
          "A shared understanding of your story, audience, and ambitions.",
          "Week 1",
        ],
        [
          "Create",
          "A distinctive identity, explored and refined together.",
          "Weeks 2-3",
        ],
        [
          "Launch",
          "A beautiful, practical website ready for the next chapter.",
          "Weeks 4-5",
        ],
      ].forEach((row, j) => {
        const y = 546 - j * 125;
        text(p, "0" + (j + 1), 48, y, 13, bold, green);
        text(p, row[0], 85, y, 18, bold);
        text(p, row[1], 85, y - 29, 10, regular, gray);
        text(p, row[2], 85, y - 53, 10, bold, green);
      });
    } else {
      text(p, "Let's make it happen.", 48, 675, 36, serif);
      text(p, "03   The next chapter", 48, 612, 17, bold);
      text(
        p,
        "Ready to begin? Add your name and signature below.",
        48,
        568,
        12,
        regular,
        gray,
      );
      text(p, "YOUR NAME", 48, 492, 8, bold, green);
      text(p, "SIGNATURE", 48, 380, 8, bold, green);
      p.drawLine({
        start: { x: 48, y: 292 },
        end: { x: 350, y: 292 },
        thickness: 1,
        color: gray,
      });
      const form = doc.getForm();
      const name = form.createTextField("Client name");
      name.addToPage(p, {
        x: 48,
        y: 440,
        width: 300,
        height: 32,
        borderWidth: 0.5,
        borderColor: rgb(0.7, 0.8, 0.75),
        backgroundColor: rgb(0.97, 0.99, 0.97),
      });
      const check = form.createCheckBox("Ready to start");
      check.addToPage(p, {
        x: 48,
        y: 234,
        width: 14,
        height: 14,
        borderWidth: 1,
      });
      text(p, "I approve this proposal.", 73, 237, 11);
    }
    p.drawLine({
      start: { x: 48, y: 82 },
      end: { x: 547, y: 82 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.85),
    });
    text(
      p,
      "NORTHLINE STUDIO  /  MADE WITH INTENTION",
      48,
      57,
      7,
      regular,
      gray,
    );
    text(p, String(i + 1).padStart(2, "0"), 529, 57, 9, bold, green);
  }
  return doc.save();
}
