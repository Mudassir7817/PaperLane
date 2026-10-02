import { Font, FontNames, Encodings } from "@pdf-lib/standard-fonts";
import type { Mark } from "./types";
export function fontName(e: Pick<Mark, "font" | "bold">) {
  return e.font === "serif"
    ? e.bold
      ? FontNames.TimesRomanBold
      : FontNames.TimesRoman
    : e.font === "mono"
      ? e.bold
        ? FontNames.CourierBold
        : FontNames.Courier
      : e.bold
        ? FontNames.HelveticaBold
        : FontNames.Helvetica;
}
export function textWidth(
  text: string,
  e: Pick<Mark, "font" | "bold" | "size">,
) {
  const font = Font.load(fontName(e));
  const glyphs = Array.from(text).map((c) => {
    try {
      return Encodings.WinAnsi.encodeUnicodeCodePoint(c.codePointAt(0)!).name;
    } catch {
      return "question";
    }
  });
  return (
    (glyphs.reduce(
      (n, g, i) =>
        n +
        (font.getWidthOfGlyph(g) || 0) +
        (font.getXAxisKerningForPair(g, glyphs[i + 1]) || 0),
      0,
    ) *
      e.size) /
    1000
  );
}
export function textLines(
  e: Pick<Mark, "font" | "bold" | "size" | "text" | "w">,
) {
  const lines: string[] = [];
  for (const paragraph of e.text.replace(/\t/g, "    ").split("\n")) {
    let line = "";
    for (const c of paragraph) {
      if (line && textWidth(line + c, e) > Math.max(1, e.w - 8)) {
        const space = line.lastIndexOf(" ");
        if (space > 0) {
          lines.push(line.slice(0, space));
          line = line.slice(space + 1);
        } else {
          lines.push(line);
          line = "";
        }
      }
      line += c;
    }
    lines.push(line);
  }
  return lines;
}
