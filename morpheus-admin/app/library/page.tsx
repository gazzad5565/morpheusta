import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { SegTabs } from "@/components/ui/SegTabs";
import { FilterChip } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { CUSTOMERS } from "@/lib/mock-data";

const FILES = [
  { name: "Onboarding handbook 2025.pdf", size: "2.4 MB", date: "12 May", custIdx: 0, type: "pdf" as const },
  { name: "Cold-storage SOP v3.pdf", size: "880 KB", date: "11 May", custIdx: 2, type: "pdf" as const },
  { name: "Site map — Aria HQ.png", size: "1.1 MB", date: "10 May", custIdx: 5, type: "img" as const },
  { name: "Promotional standee guide.pdf", size: "3.7 MB", date: "08 May", custIdx: 4, type: "pdf" as const },
  { name: "Uniform standards.pdf", size: "510 KB", date: "02 May", custIdx: -1, type: "pdf" as const },
  { name: "Weekly checklist template.xlsx", size: "74 KB", date: "28 Apr", custIdx: 6, type: "xls" as const },
  { name: "Loading-bay photos · folder", size: "24 files", date: "27 Apr", custIdx: 6, type: "folder" as const },
  { name: "Vendor contact sheet.pdf", size: "120 KB", date: "20 Apr", custIdx: -1, type: "pdf" as const },
];

export default function LibraryPage() {
  return (
    <AdminShell
      breadcrumbs={["Home", "Library"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="plus" size="sm">New folder</Btn>
          <Btn icon="upload" kind="primary" size="sm">Upload</Btn>
        </div>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={10}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "6px 8px",
            }}
          >
            Library
          </div>
          {[
            { name: "All files", icon: "lib" as GlyphName, count: 247, active: true },
            { name: "Shared with all", icon: "reps" as GlyphName, count: 18 },
            { name: "Drafts", icon: "edit" as GlyphName, count: 4 },
            { name: "Recently uploaded", icon: "clock" as GlyphName, count: 12 },
          ].map((f) => (
            <FolderItem key={f.name} {...f} />
          ))}
          <div style={{ height: 1, background: AC.line, margin: "8px 4px" }} />
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              padding: "6px 8px",
            }}
          >
            By customer
          </div>
          {CUSTOMERS.slice(0, 5).map((c) => (
            <button
              key={c.id}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "7px 8px",
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 4, background: c.color }} />
              <div
                style={{
                  flex: 1,
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.ink2,
                  fontWeight: 500,
                }}
              >
                {c.name}
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>
                {c.shiftsThisWeek}
              </div>
            </button>
          ))}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card padding={12}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FilterChip active>All types</FilterChip>
              <FilterChip>PDFs</FilterChip>
              <FilterChip>Images</FilterChip>
              <FilterChip>Spreadsheets</FilterChip>
              <div style={{ flex: 1 }} />
              <SegTabs tabs={["Grid", "List"]} active="List" />
            </div>
          </Card>
          <Card padding={0}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "36px 2.4fr 1.4fr 100px 100px 36px",
                gap: 14,
                padding: "10px 16px",
                background: AC.bg,
                borderBottom: `1px solid ${AC.line}`,
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              <div></div>
              <div>Name</div>
              <div>Shared with</div>
              <div>Size</div>
              <div>Modified</div>
              <div></div>
            </div>
            {FILES.map((f, i) => {
              const cust = f.custIdx >= 0 ? CUSTOMERS[f.custIdx] : null;
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 2.4fr 1.4fr 100px 100px 36px",
                    gap: 14,
                    alignItems: "center",
                    padding: "11px 16px",
                    borderBottom: `1px solid ${AC.lineDim}`,
                  }}
                >
                  <FileIcon type={f.type} />
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 13,
                      color: AC.ink,
                      fontWeight: 600,
                      letterSpacing: -0.1,
                    }}
                  >
                    {f.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {cust ? (
                      <>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            background: cust.color,
                            color: "#fff",
                            fontFamily: AC.font,
                            fontSize: 8,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {cust.initials}
                        </div>
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11.5,
                            color: AC.ink2,
                            fontWeight: 500,
                          }}
                        >
                          {cust.name}
                        </div>
                      </>
                    ) : (
                      <span
                        style={{
                          padding: "1px 8px",
                          borderRadius: 99,
                          background: AC.brandSoft,
                          color: AC.brandInk,
                          fontFamily: AC.font,
                          fontSize: 10.5,
                          fontWeight: 700,
                        }}
                      >
                        All reps
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11.5,
                      color: AC.mute,
                      fontWeight: 500,
                    }}
                  >
                    {f.size}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11.5,
                      color: AC.mute,
                      fontWeight: 500,
                    }}
                  >
                    {f.date}
                  </div>
                  <button
                    type="button"
                    style={{
                      width: 26,
                      height: 26,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AGlyph name="more" size={16} color={AC.mute} />
                  </button>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function FolderItem({
  name,
  icon,
  count,
  active,
}: {
  name: string;
  icon: GlyphName;
  count: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 8px",
        borderRadius: 6,
        background: active ? AC.brandSoft : "transparent",
        border: "none",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      <AGlyph name={icon} size={14} color={active ? AC.brandDeep : AC.mute} />
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 12,
          color: active ? AC.brandInk : AC.ink2,
          fontWeight: active ? 700 : 500,
        }}
      >
        {name}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>{count}</div>
    </button>
  );
}

function FileIcon({ type }: { type: "pdf" | "img" | "xls" | "folder" }) {
  const map = {
    pdf: { bg: "#FCE6E8", fg: "#B22D38", label: "PDF" },
    img: { bg: "#E2F1FA", fg: "#1B6BA8", label: "IMG" },
    xls: { bg: "#DEF2E5", fg: "#1F7A48", label: "XLS" },
    folder: { bg: "#FFF3D7", fg: "#A37404", label: "📁" },
  } as const;
  const m = map[type] || map.pdf;
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: m.bg,
        color: m.fg,
        fontFamily: AC.font,
        fontSize: 9.5,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: 0.2,
      }}
    >
      {m.label}
    </div>
  );
}
