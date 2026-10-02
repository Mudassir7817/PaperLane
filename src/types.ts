export type ElementKind =
  | "text"
  | "replacement"
  | "image"
  | "signature"
  | "check"
  | "rectangle"
  | "ellipse"
  | "highlight"
  | "comment";
export type Mark = {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  font: "sans" | "serif" | "mono";
  color: string;
  background: string;
  align: "left" | "center" | "right";
  bold: boolean;
  data?: string;
};
export type Page = {
  id: string;
  source: string;
  index: number;
  width: number;
  height: number;
  rotation: number;
  originX: number;
  originY: number;
  elements: Mark[];
};
export type EditorState = {
  pages: Page[];
  fields: Record<string, string | boolean>;
};
export type Source = { id: string; bytes: Uint8Array; name: string };
export const uid = () => crypto.randomUUID();
export const fontFamily = (font: Mark["font"]) =>
  font === "serif"
    ? '"Times New Roman", serif'
    : font === "mono"
      ? '"Courier New", monospace'
      : "Arial, sans-serif";
