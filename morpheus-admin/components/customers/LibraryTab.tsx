"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabHeader, TableColumnHeader } from "@/components/ui/TabHeader";
import { AC } from "@/lib/tokens";
import { formatFileSize, type LibraryFile } from "@/lib/library-store";

// Library rows / column header:
//   Name | Category (or "All customers" pill for shared files) | Size | chevron
// The last column has no header — the chevron is an affordance cue,
// not a semantic column.
const LIBRARY_COLS = "1fr 130px 80px 40px";

export function LibraryTab({
  files,
  onOpen,
}: {
  files: LibraryFile[];
  onOpen: (f: LibraryFile) => void;
}) {
  const router = useRouter();
  return (
    <Card padding={0}>
      <TabHeader
        title="Library files for this customer"
        count={files.length}
        action={
          files.length > 0 ? (
            <Link href="/library" style={{ textDecoration: "none" }}>
              <Btn size="sm">Manage all</Btn>
            </Link>
          ) : null
        }
      />
      <div>
        {files.length === 0 ? (
          <EmptyState
            icon="lib"
            title="No files for this customer"
            hint="Upload from the Library page and pick this customer (or 'Shared with all') to attach."
            actionLabel="Open Library"
            actionIcon="upload"
            onAction={() => router.push("/library")}
          />
        ) : (
          <>
            <TableColumnHeader columns={LIBRARY_COLS}>
              <div>Name</div>
              <div>Category</div>
              <div>Size</div>
              <div />
            </TableColumnHeader>
            {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f)}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: LIBRARY_COLS,
                gap: 14,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < files.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                background: "#fff",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 600,
                  color: AC.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {f.name}
              </div>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 99,
                  fontFamily: AC.font,
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: f.customerIds === null ? AC.brandSoft : AC.bg,
                  color: f.customerIds === null ? AC.brandInk : AC.ink2,
                  border: f.customerIds === null ? "none" : `1px solid ${AC.line}`,
                  justifySelf: "start",
                }}
              >
                {f.customerIds === null ? "All customers" : f.category || "—"}
              </span>
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 11.5,
                  color: AC.mute,
                  fontWeight: 600,
                }}
              >
                {formatFileSize(f.sizeBytes)}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", color: AC.mute }}>
                <AGlyph name="chev-r" size={14} color={AC.mute} />
              </div>
            </button>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
