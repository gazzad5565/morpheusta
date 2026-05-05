"use client";

/**
 * Admin Library page — multi-customer ready.
 *
 * Upload flow: clicking "Upload" reveals a small inline panel with
 * category dropdown + customer scope picker (All / Specific). Pick the
 * file, hit Save → uploads with the configured scope. Each row shows a
 * compact list of associated customer chips (or "All").
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import {
  listLibraryFiles,
  uploadLibraryFile,
  deleteLibraryFile,
  getLibraryDownloadUrl,
  formatFileSize,
  LIBRARY_CATEGORIES,
  DEFAULT_CATEGORY,
  type LibraryFile,
} from "@/lib/library-store";
import { CustomerScopePicker, type CustomerScope } from "@/components/ui/CustomerScopePicker";
import type { Customer } from "@/lib/types";

function fileGlyph(mime: string | null): GlyphName {
  if (!mime) return "lib";
  if (mime.startsWith("image/")) return "eye";
  return "lib";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function LibraryPage() {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Upload panel state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string>(DEFAULT_CATEGORY);
  const [pendingScope, setPendingScope] = useState<CustomerScope>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter state
  const [filterCustomer, setFilterCustomer] = useState<string>("All");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const reload = () => {
    listLibraryFiles().then((rows) => {
      setFiles(rows);
      setLoaded(true);
    });
  };

  useEffect(() => {
    reload();
    listCustomers().then(setCustomers);
  }, []);

  const onUploadClick = () => {
    setUploadOpen((o) => !o);
    setUploadError(null);
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-upload of same file later
    if (!file) return;

    // Validate scope
    if (pendingScope !== null && pendingScope.length === 0) {
      setUploadError("Pick at least one customer, or switch to 'All customers'.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    const result = await uploadLibraryFile(file, {
      customerIds: pendingScope, // null = all, [...] = specific
      category: pendingCategory || DEFAULT_CATEGORY,
    });
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error || "Upload failed");
      return;
    }
    setUploadOpen(false);
    setPendingCategory(DEFAULT_CATEGORY);
    setPendingScope(null);
    reload();
  };

  const onOpen = async (f: LibraryFile) => {
    const r = await getLibraryDownloadUrl(f.storagePath);
    if (!r.ok || !r.url) {
      alert(`Couldn't generate download link: ${r.error}`);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  };

  const onDelete = async (f: LibraryFile) => {
    if (!confirm(`Delete "${f.name}"? This removes the file from storage.`)) {
      return;
    }
    setBusyId(f.id);
    const r = await deleteLibraryFile(f);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    setFiles((arr) => arr.filter((x) => x.id !== f.id));
  };

  // ─── Filtering ─────────────────────────────────────────────────────────
  const byCustomer = useMemo(() => {
    if (filterCustomer === "All") return files;
    if (filterCustomer === "Shared") return files.filter((f) => f.customerIds === null);
    // A specific customer: show files that include this customer in their
    // customer_ids OR that are universal (apply to all → show here too).
    return files.filter(
      (f) => f.customerIds === null || f.customerIds.includes(filterCustomer)
    );
  }, [files, filterCustomer]);
  const filtered = useMemo(
    () =>
      filterCategory === "All"
        ? byCustomer
        : byCustomer.filter((f) => (f.category || DEFAULT_CATEGORY) === filterCategory),
    [byCustomer, filterCategory]
  );

  return (
    <AdminShell
      breadcrumbs={["Home", "Library"]}
      actions={
        <Btn
          kind={uploadOpen ? "secondary" : "primary"}
          size="sm"
          icon="plus"
          onClick={onUploadClick}
        >
          {uploadOpen ? "Close upload" : "Upload file"}
        </Btn>
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
        {/* Sidebar filter */}
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
          <SidebarItem
            icon="lib"
            name="All files"
            count={files.length}
            active={filterCustomer === "All"}
            onClick={() => setFilterCustomer("All")}
          />
          <SidebarItem
            icon="reps"
            name="Shared with all"
            count={files.filter((f) => f.customerIds === null).length}
            active={filterCustomer === "Shared"}
            onClick={() => setFilterCustomer("Shared")}
          />
          <div
            style={{
              padding: "10px 8px 4px",
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            By category
          </div>
          <SidebarItem
            icon="lib"
            name="All categories"
            count={files.length}
            active={filterCategory === "All"}
            onClick={() => setFilterCategory("All")}
          />
          {LIBRARY_CATEGORIES.map((cat) => {
            const count = files.filter(
              (f) => (f.category || DEFAULT_CATEGORY) === cat
            ).length;
            if (count === 0) return null;
            return (
              <SidebarItem
                key={cat}
                icon="tasks"
                name={cat}
                count={count}
                active={filterCategory === cat}
                onClick={() => setFilterCategory(cat)}
              />
            );
          })}
          <div
            style={{
              padding: "10px 8px 4px",
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            By customer
          </div>
          {customers.map((c) => {
            const count = files.filter((f) =>
              f.customerIds === null ? false : f.customerIds.includes(c.id)
            ).length;
            if (count === 0) return null;
            return (
              <SidebarItem
                key={c.id}
                icon="customer"
                name={c.name}
                count={count}
                active={filterCustomer === c.id}
                onClick={() => setFilterCustomer(c.id)}
              />
            );
          })}
        </Card>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Inline upload configurator */}
          {uploadOpen && (
            <Card padding={20}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.1,
                  marginBottom: 12,
                }}
              >
                Configure upload
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Category">
                  <select
                    value={pendingCategory}
                    onChange={(e) => setPendingCategory(e.target.value)}
                    style={selectStyle}
                  >
                    {LIBRARY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <div />
              </div>
              <Field label="Customers" hint="Pick all (universal), one, or many — files apply to whatever you select.">
                <CustomerScopePicker
                  customers={customers}
                  value={pendingScope}
                  onChange={setPendingScope}
                  allLabel="Shared with all"
                  allSubLabel="Universal — every customer can see it"
                  specificLabel="Specific customers"
                  specificSubLabel="Pick one or many"
                />
              </Field>
              {uploadError && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: AC.dangerTint,
                    color: "#9c1a3c",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <AGlyph name="warn" size={14} color="#9c1a3c" />
                  <span>{uploadError}</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                onChange={onFilePicked}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn onClick={() => setUploadOpen(false)} disabled={uploading}>
                  Cancel
                </Btn>
                <Btn
                  kind="primary"
                  icon="plus"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading…" : "Choose file & upload"}
                </Btn>
              </div>
            </Card>
          )}

          {/* File table */}
          <Card padding={0}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2.2fr 1.4fr 110px 90px 90px 90px",
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
              <div>Name</div>
              <div>Customers</div>
              <div>Category</div>
              <div>Size</div>
              <div>Uploaded</div>
              <div></div>
            </div>

            {!loaded ? (
              <Empty text="Loading library…" />
            ) : filtered.length === 0 ? (
              files.length === 0 ? (
                <Empty
                  text="No files uploaded yet."
                  sub="Click 'Upload file' to add one."
                />
              ) : (
                <Empty text="No files match this filter." />
              )
            ) : (
              filtered.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.2fr 1.4fr 110px 90px 90px 90px",
                    gap: 14,
                    alignItems: "center",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${AC.lineDim}`,
                    background: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => onOpen(f)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
                      <AGlyph name={fileGlyph(f.mimeType)} size={15} color={AC.brandDeep} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 13,
                          fontWeight: 600,
                          color: AC.ink,
                          letterSpacing: -0.1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {f.name}
                      </div>
                      {f.mimeType && (
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11,
                            color: AC.mute,
                            marginTop: 2,
                          }}
                        >
                          {f.mimeType}
                        </div>
                      )}
                    </div>
                  </div>
                  <CustomerCell file={f} />
                  <div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 99,
                        fontFamily: AC.font,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        background: AC.bg,
                        border: `1px solid ${AC.line}`,
                        color: AC.ink2,
                      }}
                    >
                      {f.category || DEFAULT_CATEGORY}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: AC.fontMono,
                      fontSize: 12,
                      color: AC.ink2,
                      fontWeight: 600,
                    }}
                  >
                    {formatFileSize(f.sizeBytes)}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.mute,
                      fontWeight: 500,
                    }}
                  >
                    {shortDate(f.uploadedAt)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                    <Link
                      href={`/library/${f.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      title="Edit file metadata"
                      aria-label="Edit file metadata"
                      style={iconBtn}
                    >
                      <AGlyph name="edit" size={14} color={AC.mute} />
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(f);
                      }}
                      disabled={busyId === f.id}
                      title="Delete file"
                      aria-label="Delete file"
                      style={{
                        ...iconBtn,
                        cursor: busyId === f.id ? "not-allowed" : "pointer",
                        opacity: busyId === f.id ? 0.4 : 1,
                      }}
                    >
                      <AGlyph name="x" size={14} color={AC.mute} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function CustomerCell({ file }: { file: LibraryFile }) {
  if (file.customerIds === null) {
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 99,
          fontFamily: AC.font,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.3,
          background: AC.brandSoft,
          color: AC.brandInk,
        }}
      >
        All customers
      </span>
    );
  }
  if (file.customers.length === 0) {
    return (
      <span style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute }}>—</span>
    );
  }
  // Show up to 3 chips, then "+N more".
  const visible = file.customers.slice(0, 3);
  const extra = file.customers.length - visible.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {visible.map((c) => (
        <span
          key={c.id}
          title={c.name}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 6px 1px 2px",
            borderRadius: 99,
            background: AC.bg,
            border: `1px solid ${AC.line}`,
            fontFamily: AC.font,
            fontSize: 10.5,
            fontWeight: 600,
            color: AC.ink2,
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              background: c.color,
              color: "#fff",
              fontSize: 8.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {c.initials}
          </span>
          {c.name.length > 12 ? c.name.slice(0, 11) + "…" : c.name}
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            padding: "2px 6px",
            borderRadius: 99,
            background: AC.bg,
            color: AC.mute,
            fontFamily: AC.font,
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function SidebarItem({
  icon,
  name,
  count,
  active,
  onClick,
}: {
  icon: GlyphName;
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 10px",
        background: active ? AC.brandSoft : "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        color: active ? AC.brandInk : AC.ink2,
        fontFamily: AC.font,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: -0.1,
        textAlign: "left",
        marginTop: 2,
      }}
    >
      <AGlyph name={icon} size={14} color={active ? AC.brandDeep : AC.mute} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span
        style={{
          padding: "1px 7px",
          borderRadius: 99,
          background: AC.bg,
          color: AC.mute,
          fontSize: 10.5,
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div
      style={{
        padding: 36,
        fontFamily: AC.font,
        fontSize: 13,
        color: AC.mute,
        textAlign: "center",
      }}
    >
      {text}
      {sub && (
        <>
          <br />
          <span style={{ fontSize: 11.5 }}>{sub}</span>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: `1px solid ${AC.line}`,
  background: "#fff",
  fontFamily: AC.font,
  fontSize: 13,
  color: AC.ink,
  cursor: "pointer",
};

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: "transparent",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  cursor: "pointer",
};
