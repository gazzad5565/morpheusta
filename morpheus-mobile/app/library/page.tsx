"use client";

/**
 * Mobile Library — real data.
 *
 * Reps see the file list uploaded by managers. Tap to open via a
 * short-lived signed URL.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";
import {
  listLibraryFiles,
  getLibraryDownloadUrl,
  formatFileSize,
  type LibraryFile,
} from "@/lib/library-store";

function fileGlyph(mime: string | null): GlyphName {
  if (!mime) return "note";
  if (mime.startsWith("image/")) return "camera";
  return "note";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function LibraryPage() {
  const router = useRouter();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    listLibraryFiles().then((rows) => {
      setFiles(rows);
      setLoaded(true);
    });
  }, []);

  const filtered = query
    ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : files;

  const onOpen = async (f: LibraryFile) => {
    if (opening) return;
    setOpening(f.id);
    const r = await getLibraryDownloadUrl(f.storagePath);
    setOpening(null);
    if (!r.ok || !r.url) {
      alert(`Couldn't open: ${r.error}`);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Library" onBack={() => router.push("/")} withMenu />

      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 28,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.6,
          }}
        >
          Library
        </div>
        <div style={{ fontFamily: MC.font, fontSize: 13.5, color: MC.mute, marginTop: 4 }}>
          {loaded
            ? `${files.length} file${files.length === 1 ? "" : "s"} from your manager`
            : "Loading…"}
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search files" />
      </div>

      <div
        style={{
          padding: "14px 16px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {!loaded ? (
          <Loading />
        ) : files.length === 0 ? (
          <Empty
            text="No files yet."
            sub="Your manager will upload reference docs from the admin console."
          />
        ) : filtered.length === 0 ? (
          <Empty text={`No files match "${query}"`} />
        ) : (
          filtered.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              opening={opening === f.id}
              onClick={() => onOpen(f)}
            />
          ))
        )}
      </div>

      <AppFooter />
    </div>
  );
}

function Loading() {
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 12,
        padding: 20,
        textAlign: "center",
        fontFamily: MC.font,
        fontSize: 13,
        color: MC.mute,
      }}
    >
      Loading library…
    </div>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div
      style={{
        background: MC.card,
        border: `1px dashed ${MC.line}`,
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontFamily: MC.font, fontSize: 13.5, color: MC.ink2, fontWeight: 600 }}>
        {text}
      </div>
      {sub && (
        <div style={{ fontFamily: MC.font, fontSize: 12, color: MC.mute, marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  opening,
  onClick,
}: {
  file: LibraryFile;
  opening: boolean;
  onClick: () => void;
}) {
  const isImage = file.mimeType?.startsWith("image/");
  const tile = isImage
    ? { bg: "#FFEDE3", fg: "#9c4a2c" }
    : file.mimeType === "application/pdf"
    ? { bg: "#FDE4EC", fg: "#9c1a3c" }
    : { bg: MC.brandTint, fg: MC.brandDeep };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={opening}
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 12,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
        cursor: opening ? "wait" : "pointer",
        textAlign: "left",
        opacity: opening ? 0.6 : 1,
        width: "100%",
      }}
    >
      <div
        style={{
          width: 40,
          height: 48,
          borderRadius: 6,
          background: tile.bg,
          color: tile.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name={fileGlyph(file.mimeType)} size={20} color={tile.fg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            color: MC.ink,
            letterSpacing: -0.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {file.name}
        </div>
        <div style={{ fontFamily: MC.font, fontSize: 12, color: MC.mute, marginTop: 2 }}>
          {shortDate(file.uploadedAt)} · {formatFileSize(file.sizeBytes)}
          {file.customerName && (
            <>
              {" · "}
              <span style={{ color: file.customerColor || MC.ink2, fontWeight: 600 }}>
                {file.customerName}
              </span>
            </>
          )}
        </div>
      </div>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: MC.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name="log" size={16} color={MC.brandDeep} />
      </div>
    </button>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Glyph name="target" size={16} color={MC.hint} strokeWidth={2} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: MC.font,
          fontSize: 14,
          color: MC.ink,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Glyph name="close" size={14} color={MC.hint} />
        </button>
      )}
    </div>
  );
}
