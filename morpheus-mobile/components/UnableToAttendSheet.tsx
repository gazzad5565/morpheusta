"use client";

/**
 * UnableToAttendSheet — slide-up sheet a rep uses to say "I can't make
 * this shift" BEFORE checking in. Friction-by-design: the entry
 * affordance is a small text-link buried inside the expanded shift
 * row (not a primary button), and this sheet adds a second
 * confirmation step (reason chip + optional note + final Notify
 * button) so it can't be triggered by an accidental tap.
 *
 * On submit the parent calls `raiseUnableToAttend` from
 * lib/shifts-store, which flips the shift's `attention` overlay and
 * logs an audit event. Admin's Live Ops "Needs action" queue picks
 * it up via the overlay query.
 *
 * Animation + style matches BreakChooserSheet on /page so the rep
 * app feels like one consistent surface.
 */

import { useState } from "react";
import { MC } from "@/lib/tokens";
import { Glyph } from "./Glyph";
import { Spinner } from "./Loading";
import type { UnableReason } from "@/lib/shifts-store";

interface ReasonOption {
  value: UnableReason;
  label: string;
  hint: string;
  glyph: "warn" | "clock" | "pin" | "info" | "note";
}

const REASONS: ReasonOption[] = [
  { value: "sick", label: "Sick / unwell", hint: "Not safe to work today", glyph: "warn" },
  {
    value: "family",
    label: "Family emergency",
    hint: "Something urgent at home",
    glyph: "info",
  },
  {
    value: "double_booked",
    label: "Double-booked",
    hint: "I have another commitment",
    glyph: "clock",
  },
  {
    value: "transport",
    label: "Transport problem",
    hint: "Can't get to site",
    glyph: "pin",
  },
  {
    value: "other",
    label: "Other",
    hint: "Add a note so the manager knows why",
    glyph: "note",
  },
];

export function UnableToAttendSheet({
  shiftName,
  onClose,
  onSubmit,
}: {
  /** Customer name for the shift, shown in the header so the rep
   *  is sure they're flagging the right one. */
  shiftName: string;
  onClose: () => void;
  /** Called with the picked reason + optional note. The parent owns
   *  the actual DB write so this component stays presentational. */
  onSubmit: (reason: UnableReason, note: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<UnableReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Other-reason MUST have a note; everything else makes it optional.
  const noteRequired = picked === "other";
  const noteValid = !noteRequired || note.trim().length > 0;
  const canSubmit = !!picked && noteValid && !busy;

  async function handleSubmit() {
    if (!picked || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(picked, note);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Couldn't send the flag — try again?");
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={busy ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,.42)",
          zIndex: 60,
          animation: "uta-fade-in .18s ease-out both",
        }}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-label="I can't make this shift"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 61,
          background: MC.card,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          padding: "16px 16px calc(env(safe-area-inset-bottom, 16px) + 12px)",
          boxShadow: "0 -16px 32px rgba(10,15,30,.22)",
          animation: "uta-slide-up .26s cubic-bezier(.22, 1, .36, 1) both",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: MC.line,
            margin: "0 auto 12px",
          }}
        />

        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 17,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.3,
            marginBottom: 4,
          }}
        >
          I can&apos;t make this shift
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12.5,
            color: MC.mute,
            marginBottom: 14,
            lineHeight: 1.45,
          }}
        >
          Pick a reason so your manager can reassign{" "}
          <b style={{ color: MC.ink }}>{shiftName}</b> in time. You can
          withdraw this until your manager actions it.
        </div>

        {/* Reason picker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {REASONS.map((r) => {
            const isPicked = r.value === picked;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setPicked(r.value)}
                disabled={busy}
                style={{
                  width: "100%",
                  background: isPicked ? MC.brandTint : "#fff",
                  border: `1px solid ${isPicked ? MC.brand : MC.line}`,
                  borderRadius: 12,
                  padding: "11px 14px",
                  cursor: busy ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  opacity: busy && !isPicked ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: isPicked ? MC.brand : MC.bg,
                    color: isPicked ? "#fff" : MC.mute,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Glyph
                    name={r.glyph}
                    size={16}
                    color={isPicked ? "#fff" : MC.mute}
                    strokeWidth={2.2}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: MC.font,
                      fontSize: 14,
                      fontWeight: 700,
                      color: MC.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    {r.label}
                  </div>
                  <div
                    style={{
                      fontFamily: MC.font,
                      fontSize: 12,
                      color: MC.mute,
                      marginTop: 2,
                    }}
                  >
                    {r.hint}
                  </div>
                </div>
                {isPicked && (
                  <Glyph name="check" size={16} color={MC.brand} strokeWidth={2.4} />
                )}
              </button>
            );
          })}
        </div>

        {/* Note */}
        <div style={{ marginTop: 14 }}>
          <label
            style={{
              fontFamily: MC.font,
              fontSize: 11.5,
              fontWeight: 600,
              color: MC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              display: "block",
              marginBottom: 6,
            }}
          >
            Note {noteRequired ? "(required)" : "(optional)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              noteRequired
                ? "Tell your manager what's happening so they can plan."
                : "Any context that helps your manager (optional)."
            }
            rows={3}
            disabled={busy}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${MC.line}`,
              fontFamily: MC.font,
              fontSize: 13.5,
              color: MC.ink,
              lineHeight: 1.45,
              resize: "vertical",
              minHeight: 72,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "9px 12px",
              borderRadius: 10,
              background: MC.dangerTint,
              color: "#9c1a3c",
              fontFamily: MC.font,
              fontSize: 12.5,
              fontWeight: 500,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <Glyph name="warn" size={14} color="#9c1a3c" />
            <span>{error}</span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              height: 48,
              background: "transparent",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: MC.font,
              fontSize: 14,
              fontWeight: 600,
              color: MC.mute,
              letterSpacing: -0.1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1.6,
              height: 48,
              borderRadius: 14,
              border: "none",
              background: canSubmit ? MC.danger : "#C9CED4",
              color: "#fff",
              fontFamily: MC.font,
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: -0.1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? `0 10px 24px ${MC.danger}55` : "none",
            }}
          >
            {busy ? <Spinner size={14} color="#fff" /> : (
              <Glyph name="arrow-r" size={16} color="#fff" strokeWidth={2.2} />
            )}
            Notify manager
          </button>
        </div>
      </div>

      <style>{`
        @keyframes uta-slide-up {
          0%   { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes uta-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}

/**
 * Human label for a reason — shared between the sheet and the
 * "Awaiting manager" pill on shift rows. Falls back to the raw
 * value when an unknown reason somehow lands in the DB (e.g. a
 * future enum extension hits an old client).
 */
export function unableReasonLabel(value: string | null | undefined): string {
  switch (value) {
    case "sick":
      return "Sick / unwell";
    case "family":
      return "Family emergency";
    case "double_booked":
      return "Double-booked";
    case "transport":
      return "Transport problem";
    case "other":
      return "Other";
    default:
      return value || "Unspecified";
  }
}
