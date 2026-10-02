import { useRef, useState } from "react";
import { X, PenLine, Type, Upload, Undo2, Check } from "lucide-react";
export default function SignatureModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: string, ratio: number) => void;
}) {
  const [mode, setMode] = useState("draw");
  const [name, setName] = useState("");
  const [ink, setInk] = useState("#173d36");
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * e.currentTarget.width) / rect.width,
      y: ((e.clientY - rect.top) * e.currentTarget.height) / rect.height,
    };
  };
  function add() {
    if (mode === "draw" && hasInk) onAdd(canvas.current!.toDataURL(), 2.8);
    else if (mode === "type" && name.trim()) {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d")!;
      const font = 'italic 95px "Segoe Script", "Brush Script MT", cursive';
      ctx.font = font;
      const w = ctx.measureText(name).width;
      c.width = Math.ceil(Math.min(1600, w + 70));
      c.height = 220;
      ctx.font = font;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.fillText(name, 30, 110, c.width - 60);
      onAdd(c.toDataURL(), c.width / c.height);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="modal signature-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">MAKE IT OFFICIAL</span>
            <h2 id="signature-title">Your signature, your way.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close signature"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="muted">
          Create a signature, then click anywhere on the page to place it.
        </p>
        <div className="tabs">
          {[
            ["draw", "Draw", PenLine],
            ["type", "Type", Type],
            ["upload", "Upload", Upload],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={mode === key ? "active" : ""}
              onClick={() => {
                setMode(String(key));
                setHasInk(false);
                setError("");
              }}
            >
              {typeof Icon !== "string" && <Icon size={17} />} {String(label)}
            </button>
          ))}
        </div>
        {mode === "draw" ? (
          <div className="signature-pad">
            <canvas
              ref={canvas}
              width={840}
              height={300}
              aria-label="Draw your signature"
              onPointerDown={(e) => {
                drawing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                const ctx = e.currentTarget.getContext("2d")!;
                const p = point(e);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.strokeStyle = ink;
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                setHasInk(true);
              }}
              onPointerMove={(e) => {
                if (drawing.current) {
                  const p = point(e);
                  const ctx = e.currentTarget.getContext("2d")!;
                  ctx.lineTo(p.x, p.y);
                  ctx.stroke();
                }
              }}
              onPointerUp={() => (drawing.current = false)}
              onPointerCancel={() => (drawing.current = false)}
            />
            <span>Sign above this line</span>
            <button
              className="clear-sign"
              onClick={() => {
                canvas.current!.getContext("2d")!.clearRect(0, 0, 840, 300);
                setHasInk(false);
              }}
            >
              <Undo2 size={14} /> Clear
            </button>
          </div>
        ) : mode === "type" ? (
          <div className="signature-type">
            <input
              autoFocus
              value={name}
              maxLength={65}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your name"
              aria-label="Signature name"
              style={{ color: ink }}
            />
          </div>
        ) : (
          <button
            className="signature-upload"
            onClick={() => upload.current?.click()}
          >
            <Upload size={28} />
            <strong>Choose your signature image</strong>
            <span>PNG or JPG · transparent PNG works best</span>
          </button>
        )}
        <input
          ref={upload}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              try {
                const url = await new Promise<string>((resolve, reject) => {
                  const r = new FileReader();
                  r.onload = () => resolve(String(r.result));
                  r.onerror = reject;
                  r.readAsDataURL(f);
                });
                const img = new Image();
                img.onload = () => onAdd(url, img.width / img.height);
                img.onerror = () =>
                  setError(
                    "This image could not be opened. Choose a PNG or JPG.",
                  );
                img.src = url;
              } catch {
                setError("This image could not be opened.");
              }
            }
          }}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="signature-bottom">
          <div className="swatches">
            {["#173d36", "#151c2c", "#224b9b"].map((c) => (
              <button
                key={c}
                title={`Ink ${c}`}
                aria-label={`Ink ${c}`}
                className={ink === c ? "chosen" : ""}
                style={{ background: c }}
                onClick={() => setInk(c)}
              />
            ))}
          </div>
          <span className="muted small">
            A visual signature, not a digital certificate.
          </span>
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              mode === "upload" || (mode === "draw" ? !hasInk : !name.trim())
            }
            onClick={add}
          >
            <Check size={17} /> Use signature
          </button>
        </div>
      </section>
    </div>
  );
}
