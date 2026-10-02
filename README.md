# Paperlane

A calm, local-first PDF editor. Open a PDF, make your changes, and download it. No account, backend, API key, or document upload service.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Choose **Try a sample PDF** to explore the included three-page proposal, including fillable fields.

```sh
npm run build       # TypeScript checks and production bundle
npm run preview     # Serve the production build locally
npm test            # PDF engine round-trip verification
npm run test:browser # Full UI workflow; run the dev server first
```

The browser test uses Playwright Chromium, or an installed Edge/Chrome if Chromium is unavailable. Install the bundled browser with `npx playwright install chromium` if needed. Test artifacts are written to the ignored `tmp/` directory.

## What works

- Open PDFs with a file picker or drag-and-drop. Multiple files are combined in selection order.
- Thumbnail navigation, zoom, fit page, fit width, and portrait/landscape rotation.
- Click to add text, images, highlights, checkmarks, rectangles, ellipses, visible comments, and signatures.
- Double-click added text to edit. Drag to move, resize from the bottom-right handle, and snap to page-center alignment guides.
- Change font, size, bold, alignment, foreground/background colors, and exact position/dimensions.
- Draw or type signatures, or upload a PNG/JPG. PNG/JPG/WebP images are supported.
- Fill standard AcroForm text fields, checkboxes, radio buttons, and single-choice fields.
- Rotate, duplicate, delete, and reorder pages with drag-and-drop or up/down buttons. Insert a blank page after the current page.
- Select multiple pages, all pages, the first two, or the last two. Merge PDFs and extract selected pages.
- Undo/redo, copy/paste added items across pages, and duplicate/delete items.
- Preview the actual exported PDF before downloading with a custom filename.
- Warn before leaving with edits that have not been downloaded. The original file is never overwritten.

## Keyboard shortcuts

| Action                      | Shortcut             |
| --------------------------- | -------------------- |
| Undo                        | Ctrl/Cmd + Z         |
| Redo                        | Ctrl/Cmd + Shift + Z |
| Copy/paste added item       | Ctrl/Cmd + C / V     |
| Duplicate added item        | Ctrl/Cmd + D         |
| Delete selected item        | Delete / Backspace   |
| Text / select tool          | T / V                |
| Finish editing text         | Ctrl/Cmd + Enter     |
| Deselect / cancel placement | Escape               |

## Honest limitations

**Existing text:** the Replace tool covers an area and places new selectable text on top. It does not edit the original content stream, erase underlying text, or securely redact. The UI makes this explicit. Font, color, and cover size can be adjusted manually; exact original fonts and complex text transformations are not reconstructed.

**Scanned pages:** scans remain images. Text can be added on top, but OCR is not included and no external OCR service is called. Pages without extractable text show this limitation in the Replace tool.

**Forms:** supported fields are flattened into fixed content on export so their values survive page copying, merging, and extraction. They are no longer interactive in the downloaded file. XFA, rich-text form formatting, and multi-select choice editing are not supported. Duplicated instances of a source field share a value.

**Fonts:** added text uses the standard Helvetica, Times Roman, or Courier PDF fonts, including bold. These fonts support Latin/WinAnsi characters. Unsupported added characters produce an explicit export error. Non-Latin source text is preserved. Use an image for added content in other scripts.

**Signatures:** signatures are visual images, not cryptographic certificates. Editing a digitally signed PDF invalidates its original digital signature.

**Page preservation:** original page content, vectors, images, page dimensions, crop boxes, and rotation are copied without rasterizing the document. New text is selectable. Bookmarks, document-level metadata, internal links, and advanced annotations are not guaranteed to survive page copying. Password-protected PDFs must be unlocked elsewhere first.

**Storage:** documents and history live in this tab's memory. Download before closing or refreshing. There is no autosave, cloud storage, or persistent document library. Very large files and long editing histories are limited by browser memory. The browser's download settings control the save location.

## Implementation

React + TypeScript + Vite, PDF.js for local rendering/text/widget discovery, and pdf-lib for page copying and export. PDF.js's worker is bundled locally; no CDN assets, web fonts, analytics, or runtime network services are required.

Elements use PDF point coordinates relative to the unrotated crop box. The entire page, including its overlays, rotates as one unit. Export converts top-left editor coordinates to bottom-left PDF coordinates, including crop offsets. Shared font metrics and line layout keep text placement consistent between editor and export.

- `src/App.tsx`: editor state/history, gestures, page operations, controls, and export preview.
- `src/PdfCanvas.tsx`: PDF.js rendering, text discovery, and supported form widgets.
- `src/pdf.ts`: immutable source loading, form filling/flattening, vector overlays, export, and sample generation.
- `src/textLayout.ts`: shared PDF font metrics and text wrapping.
- `src/SignatureModal.tsx`: draw/type/upload signature creation.
- `tests/pdf-workflow.ts`: PDF structure, page order, crop coordinates, text/image placement, forms, merge/extraction, and original preservation.
- `tests/browser-workflow.ts`: upload, text, movement, history, clipboard, forms, drawn signature, rotate/reorder/delete, preview, download, reopen, selectable text, and no external requests.

No deployment or paid SDK is required. The production `dist/` directory can also be served by any ordinary static web server.
