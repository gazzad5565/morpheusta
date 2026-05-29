"use client";

/**
 * LibraryFilePreview — in-place file preview modal (Gary, May 29:
 * "when you open a library file, don't take me to a new page — it
 * should pop up wherever I am, from a customer or from the library").
 *
 * Replaces the old `window.open(signedUrl, "_blank")` flow that punted
 * the file to a new browser tab. The modal fetches a fresh signed URL
 * itself, then previews inline:
 *   - image/*          → <img> (contained)
 *   - application/pdf  → <iframe>
 *   - anything else    → a Download + "open in a new tab" fallback
 *     (browsers can't reliably inline arbitrary types).
 *
 * Admin console is desktop-first, so the iOS-standalone user-activation
 * trap (await-between-tap-and-window.open) doesn't apply here — the
 * "open in new tab" is a plain <a target="_blank">, not a scripted
 * window.open after an await.
 *
 * Pass `file={null}` to keep it closed; pass a file object to open it.
 */

import { useEffect, useState } from "react";
import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";
import { PageLoading } from "@/components/ui/PageLoading";
import { getLibraryDownloadUrl, type LibraryFile } from "@/lib/library-store";

type PreviewTarget = Pick<LibraryFile, "name" | "storagePath" | "mimeType">;

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 7,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  flexShrink: 0,
};

export function LibraryFilePreview({
  file,
  onClose,
}: {
  file: PreviewTarget | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch a fresh signed URL each time a file is opened. Signed URLs
  // are short-lived, so we always re-sign on open rather than cache.
  useEffect(() => {
    if (!file) {
      setUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    void getLibraryDownloadUrl(file.storagePath).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok || !r.url) {
        setError(r.error || "Couldn't generate a preview link.");
        return;
      }
      setUrl(r.url);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Escape closes — standard modal affordance.
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file) return null;

  const mime = file.mimeType || "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(10,15,30,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 960,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(10,15,30,.3)",
          overflow: "hidden",
        }}
      >
        {/* Header — name + Download + Close */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${AC.line}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: AC.brandSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AGlyph name={isImage ? "camera" : "lib"} size={15} color={AC.brandDeep} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            {mime && (
              <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
                {mime}
              </div>
            )}
          </div>
          {url && (
            <a href={url} download={file.name} title="Download" aria-label="Download" style={iconBtn}>
              <AGlyph name="download" size={15} color={AC.mute} />
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Close" style={iconBtn}>
            <AGlyph name="x" size={15} color={AC.mute} />
          </button>
        </div>

        {/* Body — inline preview or fallback */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            background: isImage ? AC.bg : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading ? (
            <PageLoading label="Opening file…" />
          ) : error ? (
            <Fallback name={file.name} message={error} url={null} />
          ) : !url ? null : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.name}
              style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", display: "block" }}
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={file.name}
              style={{ width: "100%", height: "82vh", border: "none" }}
            />
          ) : (
            <Fallback
              name={file.name}
              message="This file type can't be previewed in the browser."
              url={url}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Fallback({
  name,
  message,
  url,
}: {
  name: string;
  message: string;
  url: string | null;
}) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 12,
          background: AC.bg,
          border: `1px solid ${AC.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name="lib" size={22} color={AC.mute} />
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 13.5, color: AC.ink, fontWeight: 600 }}>
        {message}
      </div>
      {url && (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <a
            href={url}
            download={name}
            style={{
              padding: "8px 14px",
              borderRadius: 9,
              background: AC.brand,
              color: "#fff",
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 14px",
              borderRadius: 9,
              background: "#fff",
              border: `1px solid ${AC.line}`,
              color: AC.ink2,
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Open in a new tab
          </a>
        </div>
      )}
    </div>
  );
}
