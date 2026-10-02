import type { Mark } from "./types";
import { fontFamily } from "./types";
import { textLines, textWidth } from "./textLayout";
export default function MarkView({ mark: e }: { mark: Mark }) {
  if (e.kind === "image" || e.kind === "signature")
    return (
      <img
        src={e.data}
        draggable={false}
        alt={e.kind === "signature" ? "Signature" : "Added image"}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
          pointerEvents: "none",
        }}
      />
    );
  if (e.kind === "check")
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path
          d="M12 52 L40 80 L90 15"
          fill="none"
          stroke={e.color}
          strokeWidth="8"
        />
      </svg>
    );
  if (e.kind === "ellipse")
    return (
      <div
        style={{
          height: "100%",
          border: `1.5px solid ${e.color}`,
          borderRadius: "50%",
          background: e.background,
          boxSizing: "border-box",
        }}
      />
    );
  if (e.kind === "rectangle")
    return (
      <div
        style={{
          height: "100%",
          border: `1.5px solid ${e.color}`,
          background: e.background,
          boxSizing: "border-box",
        }}
      />
    );
  if (e.kind === "highlight")
    return (
      <div style={{ height: "100%", background: e.color, opacity: 0.3 }} />
    );
  return (
    <svg
      width="100%"
      height="100%"
      style={{ overflow: "visible", background: e.background }}
      aria-label={e.text}
    >
      {textLines(e).map((line, i) => {
        const w = textWidth(line, e);
        return (
          <text
            key={i}
            x={
              e.align === "center"
                ? (e.w - w) / 2
                : e.align === "right"
                  ? e.w - w - 4
                  : 4
            }
            y={4 + e.size * 0.9 + i * e.size * 1.2}
            textLength={w || undefined}
            lengthAdjust="spacingAndGlyphs"
            fill={e.color}
            fontFamily={fontFamily(e.font)}
            fontSize={e.size}
            fontWeight={e.bold ? 700 : 400}
            xmlSpace="preserve"
          >
            {line}
          </text>
        );
      })}
    </svg>
  );
}
