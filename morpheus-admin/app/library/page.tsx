"use client";

/**
 * Admin Library page — real data.
 *
 * Lists every uploaded file in public.library_files (joined with the
 * customer when one is associated). Upload pushes the file to Supabase
 * Storage bucket "library" and inserts a metadata row. Click a file to
 * open it via a short-lived signed URL.
 */

import { useEffect, useRef, useState } from "react";
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
  type LibraryFile,
} from "@/lib/library-store";
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
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterCustomer, setFilterCustomer] = useState<string>("All");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingCustomer, setPendingCustomer] = useState<string>("");

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
    fileInputRef.current?.click();
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-upload of same file later
    if (!file) return;

    setUploading(true);
    const result = await uploadLibraryFile(file, {
      customerId: pendingCustomer || null,
    });
    setUploading(false);
    if (!result.ok) {
      alert(`Upload failed: ${result.error}`);
      return;
    }
    setPendingCustomer("");
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

  const filtered =
    filterCustomer === "All"
      ? files
      : filterCustomer === "Shared"
      ? files.filter((f) => !f.customerId)
      : files.filter((f) => f.customerId === filterCustomer);

  return (
    <AdminShell
      breadcrumbs={["Home", "Library"]}
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={pendingCustomer}
            onChange={(e) => setPendingCustomer(e.target.value)}
            disabled={uploading}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${AC.line}`,
              background: "#fff",
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.ink,
              cursor: "pointer",
            }}
            title="Optionally tag uploads to a customer"
          >
            <option value="">Shared with all</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                For {c.name}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            onChange={onFilePicked}
            style={{ display: "none" }}
          />
          <Btn
            kind="primary"
            size="sm"
            onClick={onUploadClick}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload file"}
          </Btn>
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
            count={files.filter((f) => !f.customerId).length}
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
            By customer
          </div>
          {customers.map((c) => {
            const count = files.filter((f) => f.customerId === c.id).length;
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

        {/* File table */}
        <Card padding={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2.4fr 1.4fr 100px 100px 60px",
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
            <div>Customer</div>
            <div>Size</div>
            <div>Uploaded</div>
            <div></div>
          </div>

          {!loaded ? (
            <div
              style={{
                padding: 28,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Loading library…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 36,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              {files.length === 0 ? (
                <>
                  No files uploaded yet.
                  <br />
                  <span style={{ fontSize: 11.5 }}>
                    Click <b style={{ color: AC.ink2 }}>Upload file</b> to add one.
                  </span>
                </>
              ) : (
                "No files match this filter."
              )}
            </div>
          ) : (
            filtered.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.4fr 1.4fr 100px 100px 60px",
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {f.customerColor && f.customerInitials ? (
                    <>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          background: f.customerColor,
                          color: "#fff",
                          fontFamily: AC.font,
                          fontSize: 9,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {f.customerInitials}
                      </div>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 12,
                          color: AC.ink2,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {f.customerName}
                      </div>
                    </>
                  ) : (
                    <span
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        color: AC.mute,
                        fontStyle: "italic",
                      }}
                    >
                      Shared with all
                    </span>
                  )}
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
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "transparent",
                      border: "none",
                      cursor: busyId === f.id ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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
    </AdminShell>
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
