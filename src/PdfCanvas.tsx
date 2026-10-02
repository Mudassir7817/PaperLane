import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Page, Source } from "./types";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
const cache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();
export function getDocument(source: Source) {
  if (!cache.has(source.id))
    cache.set(
      source.id,
      pdfjs.getDocument({ data: source.bytes.slice(), useSystemFonts: true })
        .promise,
    );
  return cache.get(source.id)!;
}
export function clearDocuments(except?: string) {
  for (const [id, promise] of cache.entries()) {
    if (id === except) continue;
    void promise.then((doc) => doc.destroy()).catch(() => {});
    cache.delete(id);
  }
}
export type TextHit = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
};
export type FieldHit = {
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  value: string | boolean;
  options: { displayValue: string; exportValue: string }[];
  readOnly: boolean;
  radio: boolean;
  buttonValue?: string;
  multiline: boolean;
};
export default function PdfCanvas({
  page,
  source,
  scale = 1,
  thumbnail = false,
  onContent,
  onError,
}: {
  page: Page;
  source: Source;
  scale?: number;
  thumbnail?: boolean;
  onContent?: (texts: TextHit[], fields: FieldHit[]) => void;
  onError?: (message: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let task: pdfjs.RenderTask | undefined;
    void (async () => {
      try {
        const doc = await getDocument(source);
        const pdfpage = await doc.getPage(page.index + 1);
        if (cancelled) return;
        const density = thumbnail
          ? 1
          : Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfpage.getViewport({
          scale: scale * density,
          rotation: 0,
        });
        const canvas = ref.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = pdfpage.render({
          canvasContext: canvas.getContext("2d")!,
          viewport,
          annotationMode: pdfjs.AnnotationMode.ENABLE,
        });
        await task.promise;
        if (onContent && !cancelled) {
          const view = pdfpage.getViewport({ scale: 1, rotation: 0 });
          const content = await pdfpage.getTextContent();
          const annotations = await pdfpage.getAnnotations();
          const texts: TextHit[] = content.items
            .filter((v): v is TextItem => "str" in v && !!v.str.trim())
            .map((t) => {
              const tr = pdfjs.Util.transform(view.transform, t.transform);
              const size = Math.hypot(tr[2], tr[3]);
              return {
                text: t.str,
                x: tr[4],
                y: tr[5] - size * 0.85,
                w: t.width,
                h: size * 1.25,
                size,
              };
            });
          const fields: FieldHit[] = annotations
            .filter(
              (a) =>
                a.subtype === "Widget" &&
                ["Tx", "Btn", "Ch"].includes(a.fieldType) &&
                !a.pushButton,
            )
            .map((a) => {
              const r = view.convertToViewportRectangle(a.rect);
              return {
                name: a.fieldName,
                type: a.fieldType,
                x: Math.min(r[0], r[2]),
                y: Math.min(r[1], r[3]),
                w: Math.abs(r[2] - r[0]),
                h: Math.abs(r[3] - r[1]),
                value:
                  a.fieldType === "Btn" && !a.radioButton
                    ? a.fieldValue !== "Off"
                    : Array.isArray(a.fieldValue)
                      ? a.fieldValue[0] || ""
                      : a.fieldValue || "",
                options: a.options || [],
                readOnly: a.readOnly,
                radio: a.radioButton,
                buttonValue: a.buttonValue,
                multiline: a.multiLine,
              };
            });
          if (!cancelled) onContent(texts, fields);
        }
      } catch (e) {
        if (
          !cancelled &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        ) {
          setError("This page could not be rendered.");
          onError?.("This page could not be rendered. Try a different PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [source.id, page.index, scale, thumbnail, onContent, onError]);
  return error ? (
    <div className="render-error">{error}</div>
  ) : (
    <canvas
      ref={ref}
      className="pdf-canvas"
      style={{ width: page.width, height: page.height }}
      aria-label={`PDF page ${page.index + 1}`}
    />
  );
}
