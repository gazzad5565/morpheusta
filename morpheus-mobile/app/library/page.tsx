"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { LIBRARY_DATA, type LibFile, type LibImage } from "@/lib/mock-data";
import { AppHeader, AppFooter, SectionLabel } from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";

export default function LibraryPage() {
  const router = useRouter();
  const [view, setView] = useState<"home" | "files" | "images">("home");
  const [query, setQuery] = useState("");

  const totalNew =
    LIBRARY_DATA.files.filter((f) => f.isNew).length +
    LIBRARY_DATA.images.filter((i) => i.isNew).length;

  if (view === "files") {
    return (
      <CategoryView
        title="Files"
        items={LIBRARY_DATA.files}
        kind="files"
        query={query}
        setQuery={setQuery}
        onBack={() => setView("home")}
      />
    );
  }
  if (view === "images") {
    return (
      <CategoryView
        title="Images"
        items={LIBRARY_DATA.images}
        kind="images"
        query={query}
        setQuery={setQuery}
        onBack={() => setView("home")}
      />
    );
  }

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
          View and download important documents
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search files & images" />
      </div>

      <div
        style={{
          padding: "14px 16px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        <MiniStat
          label="Items"
          value={`${LIBRARY_DATA.files.length + LIBRARY_DATA.images.length}`}
        />
        <MiniStat label="New" value={`${totalNew}`} accent={MC.brand} />
        <MiniStat label="Downloaded" value="0" />
      </div>

      <SectionLabel>Categories</SectionLabel>

      <div
        style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <CategoryCard
          icon="note"
          iconBg={MC.brandTint}
          iconColor={MC.brandDeep}
          label="Files"
          count={LIBRARY_DATA.files.length}
          newCount={LIBRARY_DATA.files.filter((f) => f.isNew).length}
          onClick={() => setView("files")}
        />
        <CategoryCard
          icon="camera"
          iconBg="#FFEDE3"
          iconColor="#9c4a2c"
          label="Images"
          count={LIBRARY_DATA.images.length}
          newCount={LIBRARY_DATA.images.filter((i) => i.isNew).length}
          onClick={() => setView("images")}
        />
      </div>

      <SectionLabel>Recently uploaded</SectionLabel>
      <div style={{ padding: "0 16px 22px" }}>
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 16,
          }}
        >
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: MC.hint,
            }}
          >
            Recently uploaded
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 19,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.3,
              marginTop: 4,
            }}
          >
            {LIBRARY_DATA.files[0].name}
          </div>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
              marginTop: 2,
            }}
          >
            Modified {LIBRARY_DATA.files[0].modified} · {LIBRARY_DATA.files[0].size}
          </div>
        </div>
      </div>

      <AppFooter />
    </div>
  );
}

function CategoryView({
  title,
  items,
  kind,
  query,
  setQuery,
  onBack,
}: {
  title: string;
  items: (LibFile | LibImage)[];
  kind: "files" | "images";
  query: string;
  setQuery: (v: string) => void;
  onBack: () => void;
}) {
  const filtered = query
    ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    : items;

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Library" onBack={onBack} />

      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 24,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.5,
          }}
        >
          {title}
        </div>
        <div style={{ fontFamily: MC.font, fontSize: 13, color: MC.mute, marginTop: 2 }}>
          {filtered.length} of {items.length} items
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${title}`} />
      </div>

      {kind === "files" ? (
        <div
          style={{
            padding: "14px 16px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {(filtered as LibFile[]).map((f) => (
            <FileRow key={f.id} file={f} />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "14px 16px 22px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {(filtered as LibImage[]).map((i) => (
            <ImageTile key={i.id} item={i} />
          ))}
        </div>
      )}

      <AppFooter />
    </div>
  );
}

function CategoryCard({
  icon,
  iconBg,
  iconColor,
  label,
  count,
  newCount,
  onClick,
}: {
  icon: GlyphName;
  iconBg: string;
  iconColor: string;
  label: string;
  count: number;
  newCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: MC.radiusCard,
        padding: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 14,
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name={icon} size={22} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 16,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.2,
          }}
        >
          {label}
        </div>
        <div style={{ fontFamily: MC.font, fontSize: 12.5, color: MC.mute, marginTop: 2 }}>
          {count} item{count === 1 ? "" : "s"}
        </div>
      </div>
      {newCount > 0 && (
        <span
          style={{
            background: MC.brand,
            color: "#fff",
            borderRadius: 999,
            padding: "3px 9px",
            fontFamily: MC.font,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {newCount} new
        </span>
      )}
      <Glyph name="chev-r" size={18} color={MC.hint} />
    </button>
  );
}

function FileRow({ file }: { file: LibFile }) {
  const typeColors = {
    pdf: { bg: "#FDE4EC", fg: "#9c1a3c" },
    doc: { bg: "#E3F0FF", fg: "#1f4f9c" },
  };
  const t = typeColors[file.type];
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 12,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
      }}
    >
      <div
        style={{
          width: 40,
          height: 48,
          borderRadius: 6,
          background: t.bg,
          color: t.fg,
          fontFamily: MC.font,
          fontSize: 10,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        {file.type.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            color: MC.ink,
            letterSpacing: -0.1,
          }}
        >
          {file.name}
        </div>
        <div style={{ fontFamily: MC.font, fontSize: 12, color: MC.mute, marginTop: 2 }}>
          Modified {file.modified} · {file.size}
        </div>
      </div>
      <button
        type="button"
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: MC.bg,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Glyph name="log" size={16} color={MC.brandDeep} />
      </button>
      {file.isNew && <NewRibbon />}
    </div>
  );
}

function ImageTile({ item }: { item: LibImage }) {
  return (
    <button
      type="button"
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        padding: 0,
        textAlign: "left",
        position: "relative",
      }}
    >
      <div
        style={{
          height: 110,
          background: `linear-gradient(135deg, ${item.swatch}, ${item.swatch}99)`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,.4), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(255,255,255,.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Glyph name="camera" size={14} color={MC.ink2} />
        </div>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 13,
            fontWeight: 600,
            color: MC.ink,
            letterSpacing: -0.1,
          }}
        >
          {item.name}
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            color: MC.hint,
            marginTop: 2,
          }}
        >
          {item.modified}
        </div>
      </div>
      {item.isNew && <NewRibbon />}
    </button>
  );
}

function NewRibbon() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 0,
        height: 0,
        borderTop: `36px solid ${MC.brand}`,
        borderLeft: "36px solid transparent",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: -32,
          right: 1,
          color: "#fff",
          fontFamily: MC.font,
          fontSize: 8.5,
          fontWeight: 800,
          letterSpacing: 0.5,
          transform: "rotate(45deg)",
        }}
      >
        NEW
      </span>
    </div>
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

function MiniStat({
  label,
  value,
  accent = MC.ink,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 12,
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 22,
          fontWeight: 700,
          color: accent,
          letterSpacing: -0.5,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 10.5,
          fontWeight: 600,
          color: MC.hint,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
