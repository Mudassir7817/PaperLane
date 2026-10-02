import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  GripVertical,
  HelpCircle,
  Highlighter,
  ImagePlus,
  Layers,
  Leaf,
  Maximize,
  MessageSquare,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PenLine,
  Plus,
  Redo2,
  RotateCw,
  ScanText,
  ShieldCheck,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Move,
  LockKeyhole,
  CheckCircle2,
  Circle,
  Scissors,
} from "lucide-react";
import PdfCanvas, {
  getDocument,
  clearDocuments,
  type TextHit,
  type FieldHit,
} from "./PdfCanvas";
import MarkView from "./MarkView";
import SignatureModal from "./SignatureModal";
import { createSample, exportPdf } from "./pdf";
import { textLines } from "./textLayout";
import {
  uid,
  type EditorState,
  type Source,
  type Page,
  type Mark,
  type ElementKind,
  fontFamily,
} from "./types";

type Tool = "select" | "replace" | ElementKind;
const toolList: [Tool, string, typeof Type, string][] = [
  ["select", "Select", MousePointer2, "Select and move added items (V)"],
  ["text", "Text", Type, "Click a page to add text (T)"],
  ["replace", "Replace", ScanText, "Cover existing text and add a replacement"],
  ["image", "Image", ImagePlus, "Add a PNG or JPG image"],
  ["signature", "Sign", PenLine, "Draw, type, or upload a signature"],
  ["highlight", "Highlight", Highlighter, "Add a translucent highlight"],
  ["rectangle", "Shape", Square, "Add a rectangle or ellipse"],
  ["check", "Check", CheckCheck, "Place a checkmark"],
  ["comment", "Comment", MessageSquare, "Add a visible note and PDF comment"],
];
const initial: EditorState = { pages: [], fields: {} };
function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    (name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "document").replace(
      /\.pdf$/i,
      "",
    ) + ".pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function pageTransform(p: Page) {
  return p.rotation === 90
    ? `translate(${p.height}px, 0) rotate(90deg)`
    : p.rotation === 180
      ? `translate(${p.width}px, ${p.height}px) rotate(180deg)`
      : p.rotation === 270
        ? `translate(0, ${p.width}px) rotate(270deg)`
        : "none";
}
function sizeOf(p: Page) {
  return p.rotation % 180
    ? { w: p.height, h: p.width }
    : { w: p.width, h: p.height };
}

export default function App() {
  const [history, setHistory] = useState<EditorState[]>([initial]);
  const [cursor, setCursor] = useState(0);
  const state = history[cursor];
  const stateRef = useRef(state);
  stateRef.current = state;
  const historyRef = useRef(history);
  historyRef.current = history;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const sources = useRef(new Map<string, Source>());
  const [filename, setFilename] = useState("Untitled.pdf");
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [activeId, setActiveId] = useState("");
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(0.9);
  const [fit, setFit] = useState<"page" | "width" | null>("page");
  const [texts, setTexts] = useState<TextHit[]>([]);
  const [fields, setFields] = useState<FieldHit[]>([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState(false);
  const [help, setHelp] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [pendingImage, setPendingImage] = useState<{
    data: string;
    ratio: number;
    kind: "image" | "signature";
  } | null>(null);
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const [gesture, setGesture] = useState<Mark | null>(null);
  const [guide, setGuide] = useState({ x: false, y: false });
  const [preview, setPreview] = useState<{
    bytes: Uint8Array;
    source: Source;
    pages: Page[];
    name: string;
    index: number;
    extracted: boolean;
  } | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const mergeInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const clipboard = useRef<Mark | null>(null);
  const gestureRef = useRef<{
    start: Mark;
    x: number;
    y: number;
    resize: boolean;
  } | null>(null);
  const dragPage = useRef("");
  const page = state.pages.find((p) => p.id === activeId) || state.pages[0];
  const mark = page?.elements.find((e) => e.id === selected);
  const dirty = JSON.stringify(state) !== saved;
  const commit = useCallback((next: EditorState) => {
    const entries = [
      ...historyRef.current.slice(0, cursorRef.current + 1),
      next,
    ];
    historyRef.current = entries;
    cursorRef.current = entries.length - 1;
    stateRef.current = next;
    setHistory(entries);
    setCursor(entries.length - 1);
  }, []);
  const notify = useCallback((message: string) => setToast(message), []);
  const updateMark = (patch: Partial<Mark>) => {
    if (!page || !mark) return;
    commit({
      ...state,
      pages: state.pages.map((p) =>
        p.id === page.id
          ? {
              ...p,
              elements: p.elements.map((e) =>
                e.id === mark.id ? { ...e, ...patch } : e,
              ),
            }
          : p,
      ),
    });
  };
  const undo = () => {
    if (cursor > 0) {
      setCursor(cursor - 1);
      setSelected("");
      setEditing("");
    }
  };
  const redo = () => {
    if (cursor < history.length - 1) {
      setCursor(cursor + 1);
      setSelected("");
      setEditing("");
    }
  };
  const contentReady = useCallback((t: TextHit[], f: FieldHit[]) => {
    setTexts(t);
    setFields(f);
  }, []);
  const renderError = useCallback((message: string) => setError(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    setSelectedPages((ids) =>
      ids.filter((id) => state.pages.some((p) => p.id === id)),
    );
  }, [state.pages]);
  useEffect(() => {
    if (!signature && !preview && !help) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not([hidden]), textarea, select, [tabindex="0"]',
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSignature(false);
        setPreview(null);
        setHelp(false);
      }
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [signature, !!preview, help]);
  useEffect(() => {
    setSelected("");
    setEditing("");
    setTexts([]);
    setFields([]);
  }, [page?.id]);
  useEffect(() => {
    if (!page || !fit || !scroll.current) return;
    const el = scroll.current;
    const resize = () => {
      const s = sizeOf(page);
      const available = el.clientWidth - 100;
      setZoom(
        Math.max(
          0.15,
          Math.min(
            2,
            fit === "width"
              ? available / s.w
              : Math.min(available / s.w, (el.clientHeight - 90) / s.h),
          ),
        ),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, [page?.id, page?.rotation, fit, sidebar]);
  const deleteMark = () => {
    if (!page || !selected) return;
    commit({
      ...state,
      pages: state.pages.map((p) =>
        p.id === page.id
          ? { ...p, elements: p.elements.filter((e) => e.id !== selected) }
          : p,
      ),
    });
    setSelected("");
  };
  const paste = (original = clipboard.current) => {
    if (!original || !page) return;
    const e = {
      ...original,
      id: uid(),
      x: Math.max(0, Math.min(page.width - original.w, original.x + 14)),
      y: Math.max(0, Math.min(page.height - original.h, original.y + 14)),
    };
    commit({
      ...state,
      pages: state.pages.map((p) =>
        p.id === page.id ? { ...p, elements: [...p.elements, e] } : p,
      ),
    });
    setSelected(e.id);
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const input =
        e.target instanceof HTMLElement &&
        e.target.closest("input,textarea,select,[contenteditable=true]");
      if (input) return;
      if (signature || preview || help) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteMark();
      } else if (mod && e.key.toLowerCase() === "c" && mark) {
        e.preventDefault();
        clipboard.current = { ...mark };
        notify("Item copied. Paste it on any page.");
      } else if (mod && e.key.toLowerCase() === "v" && clipboard.current) {
        e.preventDefault();
        paste();
      } else if (mod && e.key.toLowerCase() === "d" && mark) {
        e.preventDefault();
        paste(mark);
      } else if (e.key === "Escape") {
        setSelected("");
        setTool("select");
        setPendingImage(null);
      } else if (!mod && e.key.toLowerCase() === "t") setTool("text");
      else if (!mod && e.key.toLowerCase() === "v") setTool("select");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  async function parseSource(bytes: Uint8Array, name: string) {
    const source: Source = { id: uid(), bytes, name };
    await PDFDocument.load(bytes.slice());
    const doc = await getDocument(source);
    if (!doc.numPages) throw new Error("This PDF has no pages.");
    const pages: Page[] = [];
    for (let i = 0; i < doc.numPages; i++) {
      const p = await doc.getPage(i + 1);
      const v = p.getViewport({ scale: 1, rotation: 0 });
      pages.push({
        id: uid(),
        source: source.id,
        index: i,
        width: v.width,
        height: v.height,
        originX: p.view[0],
        originY: p.view[1],
        rotation: ((p.rotate % 360) + 360) % 360,
        elements: [],
      });
    }
    return { source, pages };
  }
  async function openBytes(bytes: Uint8Array, name: string, merge = false) {
    setBusy(merge ? "Adding pages…" : "Opening your PDF…");
    setError("");
    try {
      const parsed = await parseSource(bytes, name);
      if (!merge) {
        clearDocuments(parsed.source.id);
        sources.current.clear();
      }
      sources.current.set(parsed.source.id, parsed.source);
      if (merge) {
        commit({
          ...stateRef.current,
          pages: [...stateRef.current.pages, ...parsed.pages],
        });
        notify(`${parsed.pages.length} pages added.`);
      } else {
        const next = { pages: parsed.pages, fields: {} };
        stateRef.current = next;
        historyRef.current = [next];
        cursorRef.current = 0;
        setHistory([next]);
        setCursor(0);
        setSaved(JSON.stringify(next));
        setFilename(name);
        setActiveId(parsed.pages[0].id);
        setSelectedPages([]);
        setTool("select");
        setPendingImage(null);
        setEditing("");
        setSelected("");
        setFit("page");
      }
      return true;
    } catch (e) {
      setError(
        e instanceof Error && /encrypt|password/i.test(e.message)
          ? "Password-protected PDFs are not supported. Open an unlocked copy."
          : "This file could not be opened. Please choose a valid, unlocked PDF.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }
  async function openFiles(files: FileList | File[], merge = false) {
    const list = Array.from(files);
    if (!list.length) return;
    if (
      !merge &&
      dirty &&
      !window.confirm(
        "Open another PDF? Changes since your last download will be lost.",
      )
    )
      return;
    for (let i = 0; i < list.length; i++) {
      try {
        const success = await openBytes(
          new Uint8Array(await list[i].arrayBuffer()),
          list[i].name,
          merge || i > 0,
        );
        if (!success) break;
      } catch {
        setError("This file could not be read. Please choose the file again.");
        break;
      }
    }
  }
  async function sample() {
    setBusy("Preparing your sample…");
    try {
      await openBytes(await createSample(), "Northline — Project proposal.pdf");
      notify("This is a sample. Try adding a note or signing page 3.");
    } catch {
      setBusy("");
      setError("The sample could not be created.");
    }
  }
  async function blank() {
    setBusy("Creating a blank page…");
    try {
      const doc = await PDFDocument.create();
      doc.addPage(page ? [page.width, page.height] : [595.28, 841.89]);
      const parsed = await parseSource(await doc.save(), "Blank page");
      sources.current.set(parsed.source.id, parsed.source);
      if (!page) {
        const next = { pages: parsed.pages, fields: {} };
        setHistory([next]);
        setCursor(0);
        setFilename("Untitled.pdf");
        setActiveId(parsed.pages[0].id);
        setSaved(JSON.stringify(initial));
      } else {
        const pages = [...state.pages];
        pages.splice(
          pages.findIndex((p) => p.id === page.id) + 1,
          0,
          ...parsed.pages,
        );
        commit({ ...state, pages });
        setActiveId(parsed.pages[0].id);
      }
      notify("Blank page added.");
    } catch {
      setError("Could not create a blank page.");
    } finally {
      setBusy("");
    }
  }
  const targets = selectedPages.length ? selectedPages : page ? [page.id] : [];
  function pageAction(
    action: "rotate" | "delete" | "duplicate" | "up" | "down",
  ) {
    let pages = [...state.pages];
    const ids = new Set(targets);
    if (action === "delete") {
      if (ids.size >= pages.length) {
        notify("Keep at least one page in your document.");
        return;
      }
      pages = pages.filter((p) => !ids.has(p.id));
      setSelectedPages([]);
    }
    if (action === "rotate")
      pages = pages.map((p) =>
        ids.has(p.id) ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
      );
    if (action === "duplicate")
      pages = pages.flatMap((p) =>
        ids.has(p.id)
          ? [
              p,
              {
                ...p,
                id: uid(),
                elements: p.elements.map((e) => ({ ...e, id: uid() })),
              },
            ]
          : [p],
      );
    if (action === "up")
      for (let i = 1; i < pages.length; i++) {
        if (ids.has(pages[i].id) && !ids.has(pages[i - 1].id))
          [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]];
      }
    if (action === "down")
      for (let i = pages.length - 2; i >= 0; i--) {
        if (ids.has(pages[i].id) && !ids.has(pages[i + 1].id))
          [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]];
      }
    commit({ ...state, pages });
    if (!pages.some((p) => p.id === activeId)) setActiveId(pages[0].id);
  }
  function reorder(from: string, to: string) {
    if (!from || from === to) return;
    const pages = [...state.pages];
    const a = pages.findIndex((p) => p.id === from),
      b = pages.findIndex((p) => p.id === to);
    if (a < 0 || b < 0) return;
    const [moved] = pages.splice(a, 1);
    pages.splice(b, 0, moved);
    commit({ ...state, pages });
  }
  async function prepareDownload(extract = false) {
    setBusy("Preparing your PDF…");
    setError("");
    try {
      const bytes = await exportPdf(
        state,
        sources.current,
        extract ? targets : undefined,
      );
      const parsed = await parseSource(bytes, "Preview");
      setPreview({
        bytes,
        ...parsed,
        name:
          filename.replace(/\.pdf$/i, "") +
          (extract ? " — selected pages" : " — edited"),
        index: 0,
        extracted: extract,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The PDF could not be exported.",
      );
    } finally {
      setBusy("");
    }
  }
  function point(e: { clientX: number; clientY: number }) {
    const r = stage.current!.getBoundingClientRect();
    const a = (e.clientX - r.left) / zoom,
      b = (e.clientY - r.top) / zoom;
    return page.rotation === 90
      ? { x: b, y: page.height - a }
      : page.rotation === 180
        ? { x: page.width - a, y: page.height - b }
        : page.rotation === 270
          ? { x: page.width - b, y: a }
          : { x: a, y: b };
  }
  function addMark(
    kind: ElementKind,
    x: number,
    y: number,
    patch: Partial<Mark> = {},
  ) {
    const defaults: Record<string, [number, number]> = {
      text: [210, 34],
      replacement: [210, 34],
      image: [200, 130],
      signature: [180, 65],
      highlight: [180, 22],
      rectangle: [130, 75],
      ellipse: [120, 80],
      check: [28, 28],
      comment: [200, 82],
    };
    const [w, h] = defaults[kind];
    const el: Mark = {
      id: uid(),
      kind,
      x,
      y,
      w,
      h,
      text: kind === "comment" ? "Add your note" : "Your text here",
      size: kind === "comment" ? 12 : 16,
      font: "sans",
      color: kind === "highlight" ? "#f3ce47" : "#243e35",
      background:
        kind === "replacement"
          ? "#ffffff"
          : kind === "comment"
            ? "#fff4c3"
            : "transparent",
      align: "left",
      bold: false,
      ...patch,
    };
    el.x = Math.max(0, Math.min(page.width - el.w, el.x));
    el.y = Math.max(0, Math.min(page.height - el.h, el.y));
    commit({
      ...state,
      pages: state.pages.map((p) =>
        p.id === page.id ? { ...p, elements: [...p.elements, el] } : p,
      ),
    });
    setSelected(el.id);
    setTool("select");
    setPendingImage(null);
    if (["text", "replacement", "comment"].includes(kind)) {
      setEditing(el.id);
      setDraft(el.text);
    }
  }
  function pageClick(e: React.MouseEvent) {
    if (
      e.target instanceof HTMLElement &&
      e.target.closest(".element,.form-widget,.text-hit")
    )
      return;
    const p = point(e);
    if (pendingImage) {
      const w = Math.min(220, page.width * 0.5),
        h = w / pendingImage.ratio;
      addMark(pendingImage.kind, p.x, p.y, {
        data: pendingImage.data,
        w,
        h: Math.min(page.height, h),
      });
      return;
    }
    if (tool === "select") {
      setSelected("");
      return;
    }
    if (tool === "replace") {
      if (!texts.length) addMark("replacement", p.x, p.y);
      return;
    }
    if (tool === "image" || tool === "signature") return;
    addMark(tool, p.x, p.y);
  }
  function startGesture(e: React.PointerEvent, el: Mark, resize = false) {
    if (editing === el.id) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(el.id);
    const p = point(e);
    gestureRef.current = { start: el, x: p.x, y: p.y, resize };
    setGesture(el);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveGesture(e: React.PointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    const p = point(e);
    const dx = p.x - g.x,
      dy = p.y - g.y;
    let next = { ...g.start };
    let gx = false,
      gy = false;
    if (g.resize) {
      next.w = Math.max(18, Math.min(page.width - next.x, g.start.w + dx));
      next.h = Math.max(16, Math.min(page.height - next.y, g.start.h + dy));
      if (next.kind === "image" || next.kind === "signature") {
        next.h = Math.min(
          page.height - next.y,
          (next.w * g.start.h) / g.start.w,
        );
        next.w = (next.h * g.start.w) / g.start.h;
      }
    } else {
      next.x = Math.max(0, Math.min(page.width - next.w, g.start.x + dx));
      next.y = Math.max(0, Math.min(page.height - next.h, g.start.y + dy));
      if (Math.abs(next.x + next.w / 2 - page.width / 2) < 5) {
        next.x = (page.width - next.w) / 2;
        gx = true;
      }
      if (Math.abs(next.y + next.h / 2 - page.height / 2) < 5) {
        next.y = (page.height - next.h) / 2;
        gy = true;
      }
    }
    setGuide({ x: gx, y: gy });
    setGesture(next);
  }
  function finishGesture() {
    if (gestureRef.current && gesture) {
      const g = gestureRef.current;
      if (JSON.stringify(g.start) !== JSON.stringify(gesture))
        commit({
          ...state,
          pages: state.pages.map((p) =>
            p.id === page.id
              ? {
                  ...p,
                  elements: p.elements.map((el) =>
                    el.id === gesture.id ? gesture : el,
                  ),
                }
              : p,
          ),
        });
    }
    gestureRef.current = null;
    setGesture(null);
    setGuide({ x: false, y: false });
  }
  function finishText() {
    if (!editing || !page) return;
    commit({
      ...state,
      pages: state.pages.map((p) =>
        p.id === page.id
          ? {
              ...p,
              elements: p.elements.map((el) =>
                el.id === editing
                  ? {
                      ...el,
                      text: draft,
                      h: Math.max(
                        el.h,
                        textLines({ ...el, text: draft }).length *
                          el.size *
                          1.2 +
                          8,
                      ),
                    }
                  : el,
              ),
            }
          : p,
      ),
    });
    setEditing("");
  }
  async function readImage(file?: File) {
    if (!file) return;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw Error();
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = data;
      });
      let result = data;
      if (file.type === "image/webp") {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        result = c.toDataURL("image/png");
      }
      setPendingImage({
        data: result,
        ratio: img.width / img.height,
        kind: "image",
      });
      setTool("image");
      notify("Click the page to place your image.");
    } catch {
      setError("Choose a valid PNG, JPG, or WebP image.");
    }
  }
  function chooseTool(t: Tool) {
    setSelected("");
    setPendingImage(null);
    if (t === "signature") {
      setSignature(true);
      return;
    }
    if (t === "image") {
      imageInput.current?.click();
      return;
    }
    setTool(t);
  }
  const openDialog = () => openInput.current?.click();

  return (
    <div
      className={`app ${page ? "has-document" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDraggingFile(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDraggingFile(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setDraggingFile(false);
          void openFiles(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={openInput}
        hidden
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(e) => {
          if (e.target.files) void openFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={mergeInput}
        hidden
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(e) => {
          if (e.target.files) void openFiles(e.target.files, true);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void readImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (
              !page ||
              !dirty ||
              window.confirm(
                "Return home? Changes since your last download will be lost.",
              )
            ) {
              setHistory([initial]);
              setCursor(0);
              setSaved(JSON.stringify(initial));
              setActiveId("");
              clearDocuments();
              sources.current.clear();
            }
          }}
        >
          <span className="brand-icon">
            <Layers size={24} strokeWidth={1.8} />
          </span>
          paperlane<span className="brand-dot">.</span>
        </a>
        <div className="header-divider" />
        <span className="header-tagline">A little less paperwork.</span>
        {page && (
          <div className="document-name">
            <FileText size={16} />
            <span title={filename}>{filename}</span>
            <span
              className={`save-dot ${dirty ? "unsaved" : ""}`}
              title={
                dirty ? "Changes not yet downloaded" : "Original safely loaded"
              }
            />
          </div>
        )}
        <div className="header-right">
          <span className="private-badge">
            <LockKeyhole size={13} /> Private by design
          </span>
          <button
            className="icon-button help-btn"
            title="Help & keyboard shortcuts"
            aria-label="Help & keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={20} />
          </button>
          {page && (
            <>
              <button className="secondary header-open" onClick={openDialog}>
                <Upload size={15} /> Open PDF
              </button>
              <button
                className="primary"
                onClick={() => void prepareDownload()}
              >
                <Download size={16} /> Download <ChevronDown size={13} />
              </button>
            </>
          )}
        </div>
      </header>
      {!page ? (
        <main className="welcome">
          <div className="welcome-topline">
            <span>
              <span className="tiny-dot" /> YOUR EVERYDAY PDF COMPANION
            </span>
            <span>Simple tools. Endless possibilities.</span>
          </div>
          <section className="welcome-main">
            <div className="welcome-copy">
              <span className="pill">
                <Leaf size={14} /> Less friction. More getting things done.
              </span>
              <h1>
                A fresh page.
                <br />A simpler <em>way.</em>
              </h1>
              <p>
                That PDF on your to-do list? Let’s take care of it.
                <br />
                Add a note, sign your name, make it yours.
              </p>
              <button className="primary large" onClick={openDialog}>
                <Upload size={20} /> Open a PDF <ArrowRight size={18} />
              </button>
              <div className="drop-hint">or drop your file anywhere here</div>
              <div className="welcome-links">
                <button onClick={() => void sample()}>
                  Try a sample PDF <ArrowUpRight size={15} />
                </button>
                <span>·</span>
                <button onClick={() => void blank()}>
                  Start with a blank page
                </button>
              </div>
              <div className="local-promise">
                <ShieldCheck size={19} />
                <span>
                  Your files stay on your device.
                  <br />
                  <strong>
                    No accounts. No uploads. Just you and your PDF.
                  </strong>
                </span>
              </div>
            </div>
            <div
              className="welcome-art"
              aria-label="Preview of a document with simple editing tools"
            >
              <div className="art-grid" />
              <div className="art-page">
                <div className="art-page-top">
                  <span>N O R T H L I N E</span>
                  <span>01 / 03</span>
                </div>
                <div className="art-rule" />
                <div className="art-title">
                  Good things start
                  <br />
                  with a clear vision.
                </div>
                <div className="art-subtitle">
                  A new chapter for your next big idea.
                </div>
                <div className="art-label">PROJECT PROPOSAL</div>
                <div className="art-lines">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="art-highlight">
                  Make a little room for possibility.
                </div>
                <div className="art-lines short">
                  <i />
                  <i />
                </div>
                <div className="art-signature">
                  Olivia Parker
                  <span />
                  <b />
                  <b />
                  <b />
                  <b />
                </div>
                <div className="art-footer">
                  MADE WITH INTENTION <span>2026</span>
                </div>
              </div>
              <div className="art-mini-toolbar">
                <span className="active">
                  <MousePointer2 size={19} />
                </span>
                <Type size={19} />
                <PenLine size={19} />
                <Highlighter size={19} />
                <ImagePlus size={19} />
              </div>
              <div className="art-note">
                <CheckCircle2 size={20} />
                <div>
                  Looks like you.<span>Signed, sealed, ready to go.</span>
                </div>
              </div>
              <div className="art-cursor">
                <MousePointer2 size={25} fill="#22745f" />
                <span>Your signature</span>
              </div>
              <span className="art-spark">✳</span>
            </div>
          </section>
          <section className="feature-row">
            <div>
              <span className="feature-icon">
                <Type size={21} />
              </span>
              <div>
                <h3>Make it your own</h3>
                <p>Text, images, highlights. Right where you need them.</p>
              </div>
            </div>
            <div>
              <span className="feature-icon">
                <PenLine size={21} />
              </span>
              <div>
                <h3>Sign in a moment</h3>
                <p>Draw it, type it, or drop in your signature.</p>
              </div>
            </div>
            <div>
              <span className="feature-icon">
                <Layers size={21} />
              </span>
              <div>
                <h3>Get your pages in order</h3>
                <p>Rearrange, combine, and keep what matters.</p>
              </div>
            </div>
          </section>
          <footer className="welcome-footer">
            <span>A comfortable space for your documents.</span>
            <span>
              LOCAL FIRST. ALWAYS. <ShieldCheck size={14} />
            </span>
          </footer>
        </main>
      ) : (
        <>
          <div className="editor-toolbar">
            <button
              className={`icon-button ${!sidebar ? "active" : ""}`}
              aria-label="Toggle page sidebar"
              title="Toggle page sidebar"
              onClick={() => setSidebar(!sidebar)}
            >
              <PanelLeftClose size={19} />
            </button>
            <span className="toolbar-separator" />
            <div className="tools">
              {toolList.map(([id, label, Icon, title]) => (
                <button
                  key={id}
                  className={`tool ${tool === id ? "active" : ""}`}
                  title={title}
                  aria-label={label}
                  onClick={() => chooseTool(id)}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <span className="toolbar-separator" />
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
              disabled={cursor === 0}
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              disabled={cursor === history.length - 1}
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
            <div className="toolbar-spacer" />
            <button
              className="preview-button"
              onClick={() => void prepareDownload()}
            >
              <Eye size={17} />
              <span>Preview</span>
            </button>
          </div>
          <div className="editor-layout">
            {sidebar && (
              <aside className="pages-sidebar">
                <div className="sidebar-title">
                  <strong>
                    Pages <span>{state.pages.length}</span>
                  </strong>
                  <button
                    className="icon-button"
                    title="Insert a blank page after current page"
                    aria-label="Insert blank page"
                    onClick={() => void blank()}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="page-selection">
                  <select
                    aria-label="Select pages"
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedPages(
                        val === "all"
                          ? state.pages.map((p) => p.id)
                          : val === "first"
                            ? state.pages.slice(0, 2).map((p) => p.id)
                            : val === "last"
                              ? state.pages.slice(-2).map((p) => p.id)
                              : [],
                      );
                    }}
                  >
                    <option value="">
                      {selectedPages.length
                        ? `${selectedPages.length} selected`
                        : "Select pages…"}
                    </option>
                    <option value="all">All pages</option>
                    <option value="first">First two pages</option>
                    <option value="last">Last two pages</option>
                    <option value="none">Clear selection</option>
                  </select>
                  <span title="Drag thumbnails to reorder">
                    <GripVertical size={15} />
                  </span>
                </div>
                <div className="thumbnail-list">
                  {state.pages.map((p, i) => {
                    const s = sizeOf(p),
                      scale = Math.min(136 / s.w, 173 / s.h);
                    return (
                      <div
                        key={p.id}
                        className={`thumbnail-item ${p.id === page.id ? "current" : ""} ${selectedPages.includes(p.id) ? "checked" : ""}`}
                        draggable
                        onDragStart={(e) => {
                          dragPage.current = p.id;
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", p.id);
                        }}
                        onDragOver={(e) => {
                          if (dragPage.current) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          reorder(dragPage.current, p.id);
                          dragPage.current = "";
                        }}
                        onDragEnd={() => (dragPage.current = "")}
                      >
                        <input
                          type="checkbox"
                          className="page-checkbox"
                          aria-label={`Select page ${i + 1}`}
                          checked={selectedPages.includes(p.id)}
                          onChange={(e) =>
                            setSelectedPages((ids) =>
                              e.target.checked
                                ? [...ids, p.id]
                                : ids.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <button
                          className="thumbnail-button"
                          aria-label={`Go to page ${i + 1}`}
                          onClick={() => setActiveId(p.id)}
                        >
                          <div
                            className="thumbnail-paper"
                            style={{ width: s.w * scale, height: s.h * scale }}
                          >
                            <div
                              style={{
                                width: s.w,
                                height: s.h,
                                transform: `scale(${scale})`,
                                transformOrigin: "0 0",
                              }}
                            >
                              <div
                                className="page-unrotated"
                                style={{
                                  width: p.width,
                                  height: p.height,
                                  transform: pageTransform(p),
                                }}
                              >
                                <PdfCanvas
                                  page={p}
                                  source={sources.current.get(p.source)!}
                                  scale={scale}
                                  thumbnail
                                />
                                {p.elements.map((e) => (
                                  <div
                                    key={e.id}
                                    className="thumbnail-mark"
                                    style={{
                                      left: e.x,
                                      top: e.y,
                                      width: e.w,
                                      height: e.h,
                                    }}
                                  >
                                    <MarkView mark={e} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <span className="thumbnail-number">{i + 1}</span>
                        </button>
                        <span className="thumb-grip">
                          <GripVertical size={14} />
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="page-actions">
                  <span>
                    {selectedPages.length
                      ? `${selectedPages.length} selected pages`
                      : `Page ${state.pages.indexOf(page) + 1}`}
                  </span>
                  <div>
                    {[
                      [RotateCw, "rotate", "Rotate pages"],
                      [Copy, "duplicate", "Duplicate pages"],
                      [ArrowUp, "up", "Move pages up"],
                      [ArrowDown, "down", "Move pages down"],
                      [Trash2, "delete", "Delete pages"],
                    ].map(([Icon, action, label]) => (
                      <button
                        key={String(action)}
                        className="icon-button"
                        title={String(label)}
                        aria-label={String(label)}
                        onClick={() => pageAction(action as "rotate")}
                      >
                        {typeof Icon !== "string" && <Icon size={16} />}
                      </button>
                    ))}
                  </div>
                  <button
                    className="sidebar-link"
                    onClick={() => mergeInput.current?.click()}
                  >
                    <FilePlus2 size={16} /> Add another PDF <Plus size={14} />
                  </button>
                  <button
                    className="sidebar-link"
                    onClick={() => void prepareDownload(true)}
                  >
                    <Scissors size={16} /> Extract{" "}
                    {selectedPages.length ? "selected pages" : "this page"}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </aside>
            )}
            <main className="workspace">
              <div className="workspace-heading">
                <div>
                  <span className="tiny-dot" />{" "}
                  {pendingImage
                    ? "Click the page to place your " + pendingImage.kind
                    : tool === "replace"
                      ? "Click existing text to replace it"
                      : tool === "select"
                        ? "Make yourself at home."
                        : "Click anywhere on the page to add " +
                          (tool === "text" ? "text" : `a ${tool}`)}
                </div>
                <span>
                  {dirty ? "Unsaved changes" : "Original kept safe"}{" "}
                  <ShieldCheck size={14} />
                </span>
              </div>
              {tool === "replace" && (
                <div className="replacement-notice">
                  <ScanText size={16} />
                  <span>
                    {texts.length
                      ? "Replacement covers the original and adds new text. The original remains underneath — this is not secure redaction."
                      : "No extractable text found. This may be a scanned image or outlined text. Click to add a cover and replacement; OCR is not included."}
                  </span>
                </div>
              )}
              <div className="canvas-scroll" ref={scroll}>
                <div
                  className={`page-stage ${tool !== "select" ? "placing" : ""}`}
                  ref={stage}
                  style={{
                    width: sizeOf(page).w * zoom,
                    height: sizeOf(page).h * zoom,
                  }}
                  onClick={pageClick}
                  onPointerMove={moveGesture}
                  onPointerUp={finishGesture}
                  onPointerCancel={() => {
                    gestureRef.current = null;
                    setGesture(null);
                    setGuide({ x: false, y: false });
                  }}
                >
                  <div
                    style={{
                      width: sizeOf(page).w,
                      height: sizeOf(page).h,
                      transform: `scale(${zoom})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <div
                      className="page-unrotated"
                      style={{
                        width: page.width,
                        height: page.height,
                        transform: pageTransform(page),
                      }}
                    >
                      <PdfCanvas
                        page={page}
                        source={sources.current.get(page.source)!}
                        scale={zoom}
                        onContent={contentReady}
                        onError={renderError}
                      />
                      {tool === "replace" &&
                        texts.map((t, i) => (
                          <button
                            key={i}
                            className="text-hit"
                            title={`Replace: ${t.text}`}
                            aria-label={`Replace text: ${t.text}`}
                            style={{
                              left: t.x,
                              top: t.y,
                              width: Math.max(t.w, 15),
                              height: t.h,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              addMark("replacement", t.x - 2, t.y - 2, {
                                text: t.text,
                                w: Math.min(page.width - t.x, t.w + 12),
                                h: t.h + 6,
                                size: t.size,
                              });
                            }}
                          />
                        ))}
                      {fields.map((f, i) => {
                        const key = page.source + ":" + f.name;
                        const val = state.fields[key] ?? f.value;
                        const change = (value: string | boolean) =>
                          commit({
                            ...state,
                            fields: { ...state.fields, [key]: value },
                          });
                        return (
                          <div
                            key={i}
                            className="form-widget"
                            title={f.readOnly ? "Read-only field" : f.name}
                            style={{
                              left: f.x,
                              top: f.y,
                              width: f.w,
                              height: f.h,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {f.type === "Btn" ? (
                              <input
                                aria-label={f.name}
                                disabled={f.readOnly}
                                type={f.radio ? "radio" : "checkbox"}
                                name={f.name}
                                checked={
                                  f.radio ? val === f.buttonValue : !!val
                                }
                                onChange={(e) =>
                                  change(
                                    f.radio
                                      ? f.buttonValue || ""
                                      : e.target.checked,
                                  )
                                }
                              />
                            ) : f.type === "Ch" ? (
                              <select
                                disabled={f.readOnly}
                                aria-label={f.name}
                                value={String(val)}
                                onChange={(e) => change(e.target.value)}
                              >
                                {f.options.map((o) => (
                                  <option
                                    key={o.exportValue}
                                    value={o.exportValue}
                                  >
                                    {o.displayValue}
                                  </option>
                                ))}
                              </select>
                            ) : f.multiline ? (
                              <textarea
                                aria-label={f.name}
                                disabled={f.readOnly}
                                value={String(val)}
                                onChange={(e) => change(e.target.value)}
                              />
                            ) : (
                              <input
                                aria-label={f.name}
                                disabled={f.readOnly}
                                value={String(val)}
                                onChange={(e) => change(e.target.value)}
                                style={{ fontSize: Math.min(16, f.h * 0.55) }}
                              />
                            )}
                          </div>
                        );
                      })}
                      {page.elements.map((original) => {
                        const e =
                          gesture?.id === original.id ? gesture : original;
                        return (
                          <div
                            key={e.id}
                            className={`element ${selected === e.id ? "selected" : ""} ${editing === e.id ? "editing" : ""}`}
                            data-element={e.kind}
                            style={{
                              left: e.x,
                              top: e.y,
                              width: e.w,
                              height: e.h,
                            }}
                            onPointerDown={(event) => startGesture(event, e)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(e.id);
                            }}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              if (
                                ["text", "replacement", "comment"].includes(
                                  e.kind,
                                )
                              ) {
                                setEditing(e.id);
                                setDraft(e.text);
                              }
                            }}
                          >
                            {editing === e.id ? (
                              <textarea
                                autoFocus
                                aria-label="Edit text on page"
                                value={draft}
                                onPointerDown={(ev) => ev.stopPropagation()}
                                onChange={(event) =>
                                  setDraft(event.target.value)
                                }
                                onBlur={finishText}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (
                                    event.key === "Escape" ||
                                    ((event.ctrlKey || event.metaKey) &&
                                      event.key === "Enter")
                                  )
                                    event.currentTarget.blur();
                                }}
                                style={{
                                  fontFamily: fontFamily(e.font),
                                  fontSize: e.size,
                                  fontWeight: e.bold ? 700 : 400,
                                  color: e.color,
                                  background: e.background,
                                  textAlign: e.align,
                                }}
                              />
                            ) : (
                              <MarkView mark={e} />
                            )}
                            {selected === e.id && editing !== e.id && (
                              <>
                                <span className="selection-label">
                                  {e.kind === "replacement"
                                    ? "Replacement"
                                    : e.kind.charAt(0).toUpperCase() +
                                      e.kind.slice(1)}
                                </span>
                                <span className="corner tl" />
                                <span className="corner tr" />
                                <span className="corner bl" />
                                <button
                                  className="resize-handle"
                                  title="Drag to resize"
                                  aria-label="Resize selected item"
                                  onPointerDown={(ev) =>
                                    startGesture(ev, e, true)
                                  }
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                      {guide.x && (
                        <div
                          className="guide vertical"
                          style={{ left: page.width / 2 }}
                        />
                      )}
                      {guide.y && (
                        <div
                          className="guide horizontal"
                          style={{ top: page.height / 2 }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="page-caption">
                  Page {state.pages.indexOf(page) + 1} of {state.pages.length}{" "}
                  <span>·</span> {Math.round(page.width)} ×{" "}
                  {Math.round(page.height)} pt
                </div>
              </div>
              <div className="workspace-bottom">
                <div className="navigation-controls">
                  <button
                    className="icon-button"
                    aria-label="Previous page"
                    disabled={state.pages.indexOf(page) === 0}
                    onClick={() =>
                      setActiveId(state.pages[state.pages.indexOf(page) - 1].id)
                    }
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    <strong>{state.pages.indexOf(page) + 1}</strong> /{" "}
                    {state.pages.length}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Next page"
                    disabled={
                      state.pages.indexOf(page) === state.pages.length - 1
                    }
                    onClick={() =>
                      setActiveId(state.pages[state.pages.indexOf(page) + 1].id)
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
                <div className="zoom-controls">
                  <button
                    className="icon-button"
                    aria-label="Zoom out"
                    onClick={() => {
                      setFit(null);
                      setZoom((z) => Math.max(0.15, z - 0.1));
                    }}
                  >
                    <Minus size={16} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    className="icon-button"
                    aria-label="Zoom in"
                    onClick={() => {
                      setFit(null);
                      setZoom((z) => Math.min(3, z + 0.1));
                    }}
                  >
                    <Plus size={16} />
                  </button>
                  <span className="toolbar-separator" />
                  <select
                    aria-label="Page fit"
                    value={fit || "custom"}
                    onChange={(e) => setFit(e.target.value as "page" | "width")}
                  >
                    <option value="custom" disabled>
                      Custom zoom
                    </option>
                    <option value="page">Fit page</option>
                    <option value="width">Fit width</option>
                  </select>
                  <Maximize size={15} />
                </div>
              </div>
            </main>
            <aside className="properties-sidebar">
              {mark ? (
                <>
                  <div className="properties-heading">
                    <strong>
                      {mark.kind === "replacement"
                        ? "Replace text"
                        : mark.kind === "comment"
                          ? "Comment"
                          : mark.kind.charAt(0).toUpperCase() +
                            mark.kind.slice(1)}
                    </strong>
                    <button
                      className="icon-button"
                      title="Deselect item"
                      aria-label="Deselect item"
                      onClick={() => setSelected("")}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  {["text", "replacement", "comment"].includes(mark.kind) && (
                    <>
                      <label className="control-label">
                        Content
                        <textarea
                          key={mark.id + ":" + mark.text}
                          aria-label="Text content"
                          defaultValue={mark.text}
                          onBlur={(e) => {
                            if (e.target.value !== mark.text)
                              updateMark({ text: e.target.value });
                          }}
                          rows={3}
                        />
                      </label>
                      <label className="control-label">
                        Font
                        <select
                          aria-label="Font"
                          value={mark.font}
                          onChange={(e) =>
                            updateMark({ font: e.target.value as Mark["font"] })
                          }
                        >
                          <option value="sans">Helvetica</option>
                          <option value="serif">Times Roman</option>
                          <option value="mono">Courier</option>
                        </select>
                      </label>
                      <div className="control-row">
                        <label className="control-label">
                          Size
                          <input
                            aria-label="Font size"
                            type="number"
                            min="6"
                            max="144"
                            value={mark.size}
                            onChange={(e) =>
                              updateMark({
                                size: Math.max(
                                  6,
                                  Math.min(144, Number(e.target.value) || 6),
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          className={`toggle-button ${mark.bold ? "active" : ""}`}
                          aria-label="Bold"
                          title="Bold"
                          onClick={() => updateMark({ bold: !mark.bold })}
                        >
                          <Bold size={17} />
                        </button>
                      </div>
                      <label className="control-label">Alignment</label>
                      <div className="segmented">
                        {[
                          [AlignLeft, "left"],
                          [AlignCenter, "center"],
                          [AlignRight, "right"],
                        ].map(([Icon, align]) => (
                          <button
                            key={String(align)}
                            aria-label={`Align ${align}`}
                            className={mark.align === align ? "active" : ""}
                            onClick={() =>
                              updateMark({ align: align as Mark["align"] })
                            }
                          >
                            {typeof Icon !== "string" && <Icon size={17} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {!["image", "signature"].includes(mark.kind) && (
                    <>
                      <label className="control-label">
                        {mark.kind === "highlight"
                          ? "Highlight color"
                          : "Color"}
                        <div className="color-control">
                          <input
                            type="color"
                            aria-label="Text or shape color"
                            value={mark.color}
                            onChange={(e) =>
                              updateMark({ color: e.target.value })
                            }
                          />
                          <span>{mark.color.toUpperCase()}</span>
                        </div>
                      </label>
                      {mark.kind !== "highlight" && mark.kind !== "check" && (
                        <label className="control-label">
                          Background
                          <div className="color-control">
                            <input
                              aria-label="Background color"
                              type="color"
                              value={
                                mark.background === "transparent"
                                  ? "#ffffff"
                                  : mark.background
                              }
                              onChange={(e) =>
                                updateMark({ background: e.target.value })
                              }
                            />
                            <span>
                              {mark.background === "transparent"
                                ? "None"
                                : mark.background.toUpperCase()}
                            </span>
                            {mark.kind !== "replacement" && (
                              <button
                                title="Remove background"
                                aria-label="Remove background"
                                onClick={() =>
                                  updateMark({ background: "transparent" })
                                }
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </label>
                      )}
                    </>
                  )}
                  {["rectangle", "ellipse"].includes(mark.kind) && (
                    <div className="segmented">
                      <button
                        className={mark.kind === "rectangle" ? "active" : ""}
                        onClick={() => updateMark({ kind: "rectangle" })}
                      >
                        <Square size={15} /> Rectangle
                      </button>
                      <button
                        className={mark.kind === "ellipse" ? "active" : ""}
                        onClick={() => updateMark({ kind: "ellipse" })}
                      >
                        <Circle size={15} /> Ellipse
                      </button>
                    </div>
                  )}
                  <div className="properties-divider" />
                  <label className="control-label">
                    Position & size <span className="muted">pt</span>
                  </label>
                  <div className="dimension-grid">
                    {(["x", "y", "w", "h"] as const).map((k) => (
                      <label key={k}>
                        {{ x: "X", y: "Y", w: "W", h: "H" }[k]}
                        <input
                          type="number"
                          aria-label={
                            {
                              x: "X position",
                              y: "Y position",
                              w: "Width",
                              h: "Height",
                            }[k]
                          }
                          value={Math.round(mark[k])}
                          min={k === "w" || k === "h" ? 16 : 0}
                          onChange={(e) => {
                            const max =
                              k === "x"
                                ? page.width - mark.w
                                : k === "y"
                                  ? page.height - mark.h
                                  : k === "w"
                                    ? page.width - mark.x
                                    : page.height - mark.y;
                            updateMark({
                              [k]: Math.max(
                                k === "w" || k === "h" ? 16 : 0,
                                Math.min(max, Number(e.target.value) || 0),
                              ),
                            });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="properties-actions">
                    <button className="secondary" onClick={() => paste(mark)}>
                      <Copy size={15} /> Duplicate
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label="Delete selected item"
                      title="Delete selected item"
                      onClick={deleteMark}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  {mark.kind === "replacement" && (
                    <p className="tip-warning">
                      The original text remains underneath the cover. This is a
                      visual replacement, not secure redaction.
                    </p>
                  )}
                  {mark.kind === "comment" && (
                    <p className="tip-warning">
                      This note is visible in the PDF and also saved as a PDF
                      comment.
                    </p>
                  )}
                  <p className="inspector-tip">
                    <Move size={15} /> Drag to move. Use the corner to resize.
                  </p>
                </>
              ) : (
                <div className="empty-properties">
                  <div className="empty-properties-icon">
                    <MousePointer2 size={25} strokeWidth={1.4} />
                  </div>
                  <h3>
                    A little change.
                    <br />A big difference.
                  </h3>
                  <p>
                    Pick a tool above, then click
                    <br />
                    your page to get started.
                  </p>
                  <div className="quick-start">
                    <span className="eyebrow">MAKE IT YOURS</span>
                    <button onClick={() => chooseTool("text")}>
                      <Type size={18} />
                      <span>
                        Add a few words
                        <small>Put your thoughts on the page</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                    <button onClick={() => setSignature(true)}>
                      <PenLine size={18} />
                      <span>
                        Leave your signature<small>Your finishing touch</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                    <button onClick={() => chooseTool("highlight")}>
                      <Highlighter size={18} />
                      <span>
                        Mark what matters
                        <small>A little emphasis goes a long way</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="gentle-tip">
                    <span>GOOD TO KNOW</span>
                    <p>
                      Double-click added text to edit it. Made a mistake? Undo
                      is always nearby.
                    </p>
                    <kbd>Ctrl / ⌘</kbd> + <kbd>Z</kbd>
                  </div>
                </div>
              )}
              <div className="inspector-footer">
                <ShieldCheck size={17} />
                <span>
                  Just on your device.
                  <br />
                  <strong>That’s the Paperlane promise.</strong>
                </span>
              </div>
            </aside>
          </div>
          <footer className="editor-status">
            <span>
              <span className="tiny-dot" /> All processing happens in your
              browser
            </span>
            <span>
              Original file stays untouched <LockKeyhole size={11} />
            </span>
          </footer>
        </>
      )}
      {signature && (
        <SignatureModal
          onClose={() => setSignature(false)}
          onAdd={(data, ratio) => {
            setPendingImage({ data, ratio, kind: "signature" });
            setTool("signature");
            setSignature(false);
            notify("Click the page to place your signature.");
          }}
        />
      )}
      {preview && (
        <div className="modal-backdrop">
          <section
            className="modal preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">ONE LAST LOOK</span>
                <h2 id="preview-title">Ready when you are.</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close preview"
                onClick={() => setPreview(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              This is your actual exported PDF.{" "}
              {preview.extracted
                ? "Only your selected pages are included."
                : "Your original file stays untouched."}
            </p>
            <div className="export-preview">
              {(() => {
                const p = preview.pages[preview.index],
                  s = sizeOf(p),
                  z = Math.min(380 / s.w, 390 / s.h);
                return (
                  <div
                    style={{
                      width: s.w * z,
                      height: s.h * z,
                      background: "white",
                      overflow: "hidden",
                      boxShadow: "0 3px 15px #0002",
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${z})`,
                        transformOrigin: "0 0",
                        width: s.w,
                        height: s.h,
                      }}
                    >
                      <div
                        className="page-unrotated"
                        style={{
                          width: p.width,
                          height: p.height,
                          transform: pageTransform(p),
                        }}
                      >
                        <PdfCanvas page={p} source={preview.source} scale={z} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="preview-navigation">
              <button
                className="icon-button"
                aria-label="Previous preview page"
                disabled={!preview.index}
                onClick={() =>
                  setPreview({ ...preview, index: preview.index - 1 })
                }
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                Page {preview.index + 1} of {preview.pages.length}
              </span>
              <button
                className="icon-button"
                aria-label="Next preview page"
                disabled={preview.index === preview.pages.length - 1}
                onClick={() =>
                  setPreview({ ...preview, index: preview.index + 1 })
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <label className="control-label">
              File name
              <div className="filename-input">
                <input
                  aria-label="Download filename"
                  value={preview.name}
                  onChange={(e) =>
                    setPreview({ ...preview, name: e.target.value })
                  }
                />
                <span>.pdf</span>
              </div>
            </label>
            <p className="small muted">
              Filled form fields become fixed page content on download.
            </p>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setPreview(null)}>
                Keep editing
              </button>
              <button
                className="primary"
                onClick={() => {
                  downloadBytes(preview.bytes, preview.name);
                  if (!preview.extracted) setSaved(JSON.stringify(state));
                  setPreview(null);
                  notify("Your PDF is ready. Check your browser’s downloads.");
                }}
              >
                <Download size={16} /> Download PDF
              </button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="modal-heading">
              <h2 id="help-title">A little help along the way.</h2>
              <button
                className="icon-button"
                aria-label="Close help"
                onClick={() => setHelp(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              Open a PDF, choose a tool, and click the page. Select an added
              item to change its appearance. Drag it to move, or drag the
              bottom-right corner to resize.
            </p>
            <div className="shortcut-grid">
              {[
                ["Undo", "Ctrl / ⌘ + Z"],
                ["Redo", "Ctrl / ⌘ + Shift + Z"],
                ["Copy / paste item", "Ctrl / ⌘ + C / V"],
                ["Duplicate item", "Ctrl / ⌘ + D"],
                ["Delete item", "Delete / Backspace"],
                ["Text / select tool", "T / V"],
                ["Finish text edit", "Ctrl / ⌘ + Enter"],
              ].map(([l, k]) => (
                <div key={l}>
                  <span>{l}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
            <h3>Honest tools, clear expectations.</h3>
            <p>
              <strong>Existing text:</strong> Replace covers the original with a
              colored rectangle and adds new text. It does not remove the
              underlying text and is not secure redaction. Built-in fonts
              approximate the original appearance.
            </p>
            <p>
              <strong>Scans:</strong> scanned pages are images. Add text or use
              a visual replacement; OCR is not included.
            </p>
            <p>
              <strong>Forms:</strong> standard text, checkbox, radio, and choice
              fields are supported. Filled forms become fixed content on export.
              XFA forms and password-protected PDFs are not supported.
            </p>
            <p>
              <strong>Text & signatures:</strong> built-in fonts support Latin
              text. Signatures are images, not cryptographic signatures. Editing
              invalidates existing digital signatures. Page links, bookmarks,
              and document-level metadata may not survive page copying.
            </p>
            <p>
              <strong>Private & temporary:</strong> documents never leave this
              browser. Work is kept in memory, so download before closing or
              refreshing. No account or server is involved.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              Got it <Check size={16} />
            </button>
          </section>
        </div>
      )}
      {draggingFile && (
        <div className="file-drop-overlay">
          <Upload size={42} />
          <h2>A fresh page awaits.</h2>
          <p>Drop your PDF to open it</p>
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <div className="spinner" />
          <span>{busy}</span>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
