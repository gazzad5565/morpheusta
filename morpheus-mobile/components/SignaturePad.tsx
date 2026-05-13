"use client";

/**
 * SignaturePad — full-screen signature capture modal (Feature D).
 *
 * Renders a canvas with smooth-line drawing for touch / pen / mouse.
 * Used when a rep taps a task with `requiresSignature=true` on the
 * active page. Captures the signature as a base64 PNG data URL and
 * passes it to onSave for upload via saveShiftTaskSignature().
 *
 * Design choices:
 *   - Full-screen overlay (not a slide-up sheet) — gives reps a big
 *     canvas to draw on without competing with the rest of the UI,
 *     and dodges the iOS body-scroll-bounce that would otherwise
 *     interfere with the touch handlers.
 *   - Landscape orientation suggested via copy ("Turn your phone
 *     sideways for a bigger pad") — we don't force-rotate, that's
 *     a worse UX than letting reps choose.
 *   - DPR-aware drawing (canvas is rendered at devicePixelRatio so
 *     strokes are crisp on retina screens; the saved data URL is
 *     downscaled to a sensible resolution so the column stays small).
 *   - Touch-action: none on the canvas so iOS doesn't try to
 *     scroll-pan when the rep is drawing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";

interface Props {
  /** Customer name for the prompt (e.g. "Signature for Acme Co"). */
  customerName?: string;
  /** Task name for the prompt (e.g. "Confirm stock count"). */
  taskName: string;
  /** Optional pre-existing signature data URL — when present, the
   *  modal opens already showing it (re-sign flow). */
  initialDataUrl?: string | null;
  /** Optional pre-existing signer name. */
  initialSignerName?: string | null;
  /** Fired on Save. The handler is responsible for the actual
   *  persistence + closing the modal afterwards. */
  onSave: (args: {
    signatureDataUrl: string;
    signerName: string | null;
  }) => void | Promise<void>;
  /** Fired on Cancel or backdrop tap. */
  onCancel: () => void;
  /** When true, disable Save + show a spinner — the parent is
   *  uploading. */
  saving?: boolean;
  /** Optional inline error (e.g. upload failed). */
  error?: string | null;
}

/** Target export resolution — keeps the data URL well under 30 KB
 *  while still being clear on a printed page. */
const EXPORT_W = 600;
const EXPORT_H = 240;

export function SignaturePad({
  customerName,
  taskName,
  initialDataUrl,
  initialSignerName,
  onSave,
  onCancel,
  saving,
  error,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Has anything been drawn? Drives the Save button's enabled state
  // and the "Tap to start signing" placeholder copy. Mirrored to
  // local state so the Save button re-renders.
  const [hasInk, setHasInk] = useState(!!initialDataUrl);
  const [signerName, setSignerName] = useState(initialSignerName ?? "");

  // (Re)initialise the canvas at the current devicePixelRatio whenever
  // it mounts or the window resizes (e.g. rotation). We have to size
  // the BACKING STORE in device pixels and the CSS size in CSS px so
  // strokes stay crisp on retina screens without becoming microscopic.
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a0f1e";
    ctxRef.current = ctx;
    // If the parent passed an initial signature, draw it back.
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, cssW, cssH);
      };
      img.src = initialDataUrl;
    }
  }, [initialDataUrl]);

  useEffect(() => {
    initCanvas();
    const onResize = () => initCanvas();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [initCanvas]);

  // Translate a Pointer / Touch / Mouse event to a CSS-pixel point
  // local to the canvas.
  const pointFromEvent = (e: PointerEvent | TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      clientX = (e as PointerEvent | MouseEvent).clientX;
      clientY = (e as PointerEvent | MouseEvent).clientY;
    } else {
      return null;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startStroke = (e: PointerEvent | TouchEvent | MouseEvent) => {
    if (saving) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    if (!p) return;
    drawingRef.current = true;
    lastPointRef.current = p;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const continueStroke = (e: PointerEvent | TouchEvent | MouseEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    if (!p) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    if (!hasInk) setHasInk(true);
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.closePath();
  };

  // Wire up listeners ONCE, on the canvas DOM node (not React's
  // synthetic events) — Pointer Events give us pen + touch + mouse
  // unified, with passive:false so preventDefault() actually
  // prevents iOS rubber-band scrolling under our fingers.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const start = (e: PointerEvent) => startStroke(e);
    const move = (e: PointerEvent) => continueStroke(e);
    const end = () => endStroke();
    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", end);
    return () => {
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("pointerleave", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasInk) return;
    // Downscale to the export resolution before producing the data
    // URL — keeps the column small even when the rep drew on a
    // 3x-DPR phone canvas. We use a temporary offscreen canvas at
    // the target size; drawImage handles the resampling.
    const out = document.createElement("canvas");
    out.width = EXPORT_W;
    out.height = EXPORT_H;
    const octx = out.getContext("2d");
    if (!octx) return;
    // White background — saved PNG ends up looking right when
    // embedded in the customer report later (alpha can read as
    // a black rectangle in some report renderers).
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, EXPORT_W, EXPORT_H);
    octx.drawImage(canvas, 0, 0, EXPORT_W, EXPORT_H);
    const dataUrl = out.toDataURL("image/png");
    await onSave({
      signatureDataUrl: dataUrl,
      signerName: signerName.trim() || null,
    });
  };

  return (
    <div
      role="dialog"
      aria-label="Capture customer signature"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(10,15,30,.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        // The whole overlay is the safe-area-respecting container.
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        // Backdrop tap cancels — but only if the tap itself was on
        // the backdrop, not bubbled from the card.
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,.4)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${MC.line}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: MC.brandTint,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Glyph name="edit" size={16} color={MC.brandDeep} strokeWidth={2.4} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13.5,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.1,
              }}
            >
              Customer signature
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 12,
                color: MC.mute,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={`${taskName}${customerName ? ` · ${customerName}` : ""}`}
            >
              {taskName}
              {customerName ? ` · ${customerName}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cancel"
            style={{
              background: "transparent",
              border: "none",
              padding: 6,
              cursor: saving ? "not-allowed" : "pointer",
              color: MC.mute,
            }}
          >
            <Glyph name="close" size={18} color={MC.mute} strokeWidth={2.4} />
          </button>
        </div>

        {/* Canvas + hint */}
        <div style={{ padding: 14, flex: 1, minHeight: 0 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 7",
              maxHeight: 320,
              borderRadius: 14,
              border: `1.5px dashed ${MC.line}`,
              background: "#fafbfc",
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                touchAction: "none",
                cursor: "crosshair",
              }}
            />
            {!hasInk && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  color: MC.hint,
                  gap: 6,
                }}
              >
                <Glyph
                  name="edit"
                  size={22}
                  color={MC.hint}
                  strokeWidth={2.2}
                />
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  Customer signs here
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 11,
                    color: MC.hint,
                  }}
                >
                  Tip: turn your phone sideways for a bigger pad
                </div>
              </div>
            )}
          </div>

          {/* Optional signer name field */}
          <label
            style={{
              display: "block",
              marginTop: 14,
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: MC.hint,
              marginBottom: 6,
            }}
          >
            Signer name (optional)
          </label>
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Who signed? (e.g. store manager)"
            disabled={saving}
            style={{
              width: "100%",
              padding: "10px 12px",
              height: 42,
              fontSize: 14,
              fontFamily: MC.font,
              color: MC.ink,
              background: "#fff",
              border: `1px solid ${MC.line}`,
              borderRadius: 10,
              outline: "none",
            }}
          />

          {error && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: MC.dangerTint,
                border: `1px solid ${MC.danger}33`,
                borderRadius: 10,
                fontFamily: MC.font,
                fontSize: 12,
                color: "#9c1a3c",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: "10px 14px 14px",
            display: "flex",
            gap: 8,
            alignItems: "center",
            borderTop: `1px solid ${MC.line}`,
          }}
        >
          <button
            type="button"
            onClick={clearPad}
            disabled={saving || !hasInk}
            style={{
              minHeight: 42,
              padding: "0 14px",
              borderRadius: 10,
              background: "#fff",
              color: MC.ink2,
              border: `1px solid ${MC.line}`,
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving || !hasInk ? "not-allowed" : "pointer",
              opacity: saving || !hasInk ? 0.5 : 1,
            }}
          >
            Clear
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              minHeight: 42,
              padding: "0 16px",
              borderRadius: 10,
              background: "#fff",
              color: MC.ink2,
              border: `1px solid ${MC.line}`,
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasInk}
            style={{
              minHeight: 42,
              padding: "0 18px",
              borderRadius: 10,
              background: !hasInk || saving ? MC.line : MC.brandDeep,
              color: !hasInk || saving ? MC.hint : "#fff",
              border: "none",
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || !hasInk ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow:
                !hasInk || saving ? "none" : `0 6px 14px ${MC.brand}44`,
            }}
          >
            <Glyph name="check" size={14} color="#fff" strokeWidth={2.4} />
            {saving ? "Saving…" : "Save signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
