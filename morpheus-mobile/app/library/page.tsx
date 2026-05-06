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
  subscribeLibrary,
  LIBRARY_CATEGORIES,
  DEFAULT_CATEGORY,
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
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listLibraryFiles().then((rows) => {
        if (cancelled) return;
        setFiles(rows);
        setLoaded(true);
      });
    load();
    // Refetch on tab focus + on any library_files change so a manager's
    // upload appears on the rep's phone without a manual refresh.
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    const unsub = subscribeLibrary(load);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      unsub();
    };
  }, []);

  const byCategory =
    activeCategory === "All"
      ? files
      : files.filter((f) => (f.category || DEFAULT_CATEGORY) === activeCategory);
  const filtered = query
    ? byCategory.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : byCategory;

  // Categories with at least one file (so we don't show empty chips for
  // categories nobody has uploaded to).
  const categoryCounts = LIBRARY_CATEGORIES.map((c) => ({
    name: c,
    count: files.filter((f) => (f.category || DEFAULT_CATEGORY) === c).length,
  })).filter((c) => c.count > 0);

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

      {categoryCounts.length > 0 && (
        <div
          style={{
            padding: "12px 16px 0",
            display: "flex",
            gap: 6,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          <CategoryChip
            label="All"
            count={files.length}
            active={activeCategory === "All"}
            onClick={() => setActiveCategory("All")}
          />
          {categoryCounts.map((c) => (
            <CategoryChip
              key={c.name}
              label={c.name}
              count={c.count}
              active={activeCategory === c.name}
              onClick={() => setActiveCategory(c.name)}
            />
          ))}
        </div>
      )}

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
          {file.category || DEFAULT_CATEGORY} · {shortDate(file.uploadedAt)} ·{" "}
          {formatFileSize(file.sizeBytes)}
        </div>
        <div style={{ marginTop: 6 }}>
          {file.customerIds === null ? (
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 99,
                background: MC.brandTint,
                color: MC.brandInk,
                fontFamily: MC.font,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              All customers
            </span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {file.customers.slice(0, 3).map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "1px 6px 1px 2px",
                    borderRadius: 99,
                    background: MC.bg,
                    border: `1px solid ${MC.line}`,
                    fontFamily: MC.font,
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: MC.ink2,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: c.color,
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.initials}
                  </span>
                  {c.name}
                </span>
              ))}
              {file.customers.length > 3 && (
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 99,
                    background: MC.bg,
                    color: MC.mute,
                    fontFamily: MC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  +{file.customers.length - 3}
                </span>
              )}
            </div>
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

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        background: active ? MC.ink : "#fff",
        color: active ? "#fff" : MC.ink2,
        border: `1px solid ${active ? MC.ink : MC.line}`,
        fontFamily: MC.font,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: -0.1,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 700,
          background: active ? "rgba(255,255,255,.18)" : MC.bg,
          color: active ? "#fff" : MC.mute,
        }}
      >
        {count}
      </span>
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
