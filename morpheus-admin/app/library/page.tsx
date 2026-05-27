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
import { LoadingBar } from "@/components/ui/LoadingBar";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import {
  listLibraryFiles,
  uploadLibraryFile,
  deleteLibraryFile,
  getLibraryDownloadUrl,
  formatFileSize,
  DEFAULT_CATEGORY,
  type LibraryFile,
} from "@/lib/library-store";
import {
  getLibraryCategories,
  setLibraryCategories,
} from "@/lib/settings-store";
import { CustomerScopePicker, type CustomerScope } from "@/components/ui/CustomerScopePicker";
import { Combobox } from "@/components/ui/Combobox";
import { SegTabs } from "@/components/ui/SegTabs";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";
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
  // Categories are now persisted in app_settings (see settings-store)
  // so a manager can rename / add / delete them via the
  // ManageCategoriesSheet mounted below. We mirror them into local
  // state on mount + every time the sheet saves so dropdowns + the
  // category filter rail update without a full page reload.
  const [categories, setCategories] = useState<string[]>([]);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  // Table | Grid view toggle — parity with /reps and /customers, with
  // the chosen view persisted across navigation so managers don't
  // reset to default on every nav.
  const [view, setView] = useState<"Table" | "Grid">(() => {
    if (typeof window === "undefined") return "Table";
    const saved = window.localStorage.getItem("morpheus.library_view.v1");
    return saved === "Grid" ? "Grid" : "Table";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("morpheus.library_view.v1", view);
    } catch {
      /* quota / disabled */
    }
  }, [view]);

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
  const [search, setSearch] = useState<string>("");
  // Pagination — 0-indexed. Resets to 0 whenever a filter changes.
  const [page, setPage] = useState(0);

  const reload = () => {
    listLibraryFiles().then((rows) => {
      setFiles(rows);
      setLoaded(true);
    });
  };

  useEffect(() => {
    reload();
    listCustomers().then(setCustomers);
    getLibraryCategories().then(setCategories);
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
  const byCategory = useMemo(
    () =>
      filterCategory === "All"
        ? byCustomer
        : byCustomer.filter((f) => (f.category || DEFAULT_CATEGORY) === filterCategory),
    [byCustomer, filterCategory]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.category || DEFAULT_CATEGORY).toLowerCase().includes(q) ||
        (f.mimeType || "").toLowerCase().includes(q) ||
        f.customers.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [byCategory, search]);

  // Reset to page 0 whenever any filter changes — without this the
  // user could land on an empty page after narrowing results.
  useEffect(() => {
    setPage(0);
  }, [filterCustomer, filterCategory, search]);

  // Slice the filtered array down to the current page's window. Both
  // Grid and Table views consume this same slice so pagination works
  // identically across views.
  const pageItems = filtered.slice(
    page * DEFAULT_PAGE_SIZE,
    (page + 1) * DEFAULT_PAGE_SIZE
  );

  // Dynamic category list — union of the manager-managed list (from
  // settings) plus any free-text categories that already appear on
  // uploaded files. Files whose category has since been removed
  // still appear sensibly under their old name; deleting a category
  // is a no-op for existing files. Sorted, de-duped.
  const allCategories = useMemo(() => {
    const set = new Set<string>(categories);
    for (const f of files) {
      if (f.category) set.add(f.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files, categories]);

  return (
    <AdminShell
      breadcrumbs={["Home", "Library"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn
            size="sm"
            icon="settings"
            onClick={() => setManageCatsOpen(true)}
            title="Add, rename, or remove library categories"
          >
            Categories
          </Btn>
          <Btn
            kind={uploadOpen ? "secondary" : "primary"}
            size="sm"
            icon={uploadOpen ? "x" : "plus"}
            onClick={onUploadClick}
          >
            {uploadOpen ? "Cancel upload" : "Upload file"}
          </Btn>
        </div>
      }
    >
      {!loaded && <LoadingBar />}
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
          {allCategories.map((cat) => {
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
                <Field
                  label="Category"
                  hint="Pick an existing one or type a new name to create it."
                >
                  {/* Free-text input with a datalist of existing
                      categories. Lets a manager create a category
                      just by typing — no migration needed since the
                      DB column is already free-text. */}
                  <input
                    type="text"
                    list="library-category-list"
                    value={pendingCategory}
                    onChange={(e) => setPendingCategory(e.target.value)}
                    placeholder="e.g. Documents, Onboarding, Compliance…"
                    style={{
                      ...selectStyle,
                      // Datalist inputs render as plain text inputs;
                      // keep parity with the select's height/padding.
                      appearance: "none",
                    }}
                  />
                  <datalist id="library-category-list">
                    {allCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
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

          {/* Search bar — same affordance as Customers / Reps / Tasks
              for consistency across the admin. Filters across name,
              category, MIME type, and joined customer names. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "#fff",
              border: `1px solid ${AC.line}`,
              borderRadius: 10,
            }}
          >
            <AGlyph name="search" size={14} color={AC.hint} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files by name, category, type, or customer…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.ink,
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  color: AC.mute,
                }}
              >
                <AGlyph name="x" size={13} color={AC.mute} />
              </button>
            )}
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
              }}
            >
              {filtered.length} of {files.length}
            </span>
            <div style={{ flex: 1 }} />
            <SegTabs
              tabs={["Table", "Grid"]}
              active={view}
              onChange={(v) => setView(v as "Table" | "Grid")}
            />
          </div>

          {/* File list — Table or Grid view depending on the toggle. */}
          {view === "Grid" ? (
            <FileGrid
              files={pageItems}
              loaded={loaded}
              hasAnyFiles={files.length > 0}
              onOpen={onOpen}
            />
          ) : (
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
              pageItems.map((f) => (
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
          )}

          <Pagination
            totalItems={filtered.length}
            currentPage={page}
            onPageChange={setPage}
          />
        </div>
      </div>

      {manageCatsOpen && (
        <ManageCategoriesSheet
          current={categories}
          onClose={() => setManageCatsOpen(false)}
          onSaved={(next) => {
            setCategories(next);
            setManageCatsOpen(false);
          }}
        />
      )}
    </AdminShell>
  );
}

/**
 * ManageCategoriesSheet — full CRUD for library categories. Centred
 * modal. Add via the bottom input + Add button; rename inline; remove
 * via the X next to each row. Save commits the whole new list to
 * app_settings via setLibraryCategories.
 *
 * Files in a removed category are NOT moved or hidden — they continue
 * to display under their old category name and the allCategories
 * computation on the page falls back to including them (see comment
 * on `allCategories`). This is intentional: a manager who removes a
 * stale category shouldn't lose track of the files that were tagged
 * with it.
 */
/**
 * Grid view for the file list — parity with /reps and /customers
 * Grid views. Each file renders as a tile with a large file-type
 * glyph, name, customer scope, and category pill. Tile click does
 * the same thing as the table row (signed-URL download).
 */
function FileGrid({
  files,
  loaded,
  hasAnyFiles,
  onOpen,
}: {
  files: LibraryFile[];
  loaded: boolean;
  hasAnyFiles: boolean;
  onOpen: (f: LibraryFile) => void;
}) {
  if (!loaded) {
    return (
      <Card padding={0}>
        <Empty text="Loading library…" />
      </Card>
    );
  }
  if (files.length === 0) {
    return (
      <Card padding={0}>
        <Empty
          text={hasAnyFiles ? "No files match this filter." : "No files uploaded yet."}
          sub={hasAnyFiles ? undefined : "Click 'Upload file' to add one."}
        />
      </Card>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}
    >
      {files.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onOpen(f)}
          style={{
            background: "#fff",
            border: `1px solid ${AC.line}`,
            borderRadius: 12,
            padding: 14,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            textAlign: "left",
            minHeight: 140,
            boxShadow: "0 1px 2px rgba(10,15,30,.03)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: AC.brandSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AGlyph name={fileGlyph(f.mimeType)} size={22} color={AC.brandDeep} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={f.name}
            >
              {f.name}
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                marginTop: 3,
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {f.category && (
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 99,
                    background: AC.bg,
                    color: AC.ink2,
                    fontWeight: 600,
                  }}
                >
                  {f.category}
                </span>
              )}
              {f.sizeBytes != null && <span>{formatFileSize(f.sizeBytes)}</span>}
              {f.sizeBytes != null && f.uploadedAt && <span style={{ opacity: 0.4 }}>·</span>}
              <span>{shortDate(f.uploadedAt)}</span>
            </div>
          </div>
          <div style={{ marginTop: "auto" }}>
            <CustomerCell file={f} />
          </div>
        </button>
      ))}
    </div>
  );
}

function ManageCategoriesSheet({
  current,
  onClose,
  onSaved,
}: {
  current: string[];
  onClose: () => void;
  onSaved: (next: string[]) => void;
}) {
  const [list, setList] = useState<string[]>(() => [...current]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOne = () => {
    setError(null);
    const name = newName.trim();
    if (!name) return;
    if (list.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already in the list.`);
      return;
    }
    setList([...list, name]);
    setNewName("");
  };
  const renameAt = (i: number, name: string) => {
    const next = [...list];
    next[i] = name;
    setList(next);
  };
  const removeAt = (i: number) => {
    setList(list.filter((_, j) => j !== i));
  };
  const save = async () => {
    setError(null);
    setBusy(true);
    const r = await setLibraryCategories(list);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    onSaved(list);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,.32)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-label="Manage library categories"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 460,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          background: "#fff",
          border: `1px solid ${AC.line}`,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(10,15,30,.24)",
          zIndex: 201,
          padding: 22,
          fontFamily: AC.font,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: AC.ink, letterSpacing: -0.2 }}>
              Library categories
            </div>
            <div style={{ fontSize: 12, color: AC.mute, marginTop: 2 }}>
              Add, rename, or remove the categories shown in the upload form. Files
              already tagged with a removed category stay visible under their old name.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="x" size={14} color={AC.mute} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {list.length === 0 ? (
            <div style={{ fontSize: 12.5, color: AC.mute }}>
              No categories yet — add at least one below.
            </div>
          ) : (
            list.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  background: AC.bg,
                  borderRadius: 8,
                }}
              >
                <input
                  value={c}
                  onChange={(e) => renameAt(i, e.target.value)}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    borderRadius: 6,
                    border: `1px solid ${AC.line}`,
                    background: "#fff",
                    fontFamily: AC.font,
                    fontSize: 13,
                    color: AC.ink,
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  title={`Remove "${c}"`}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${AC.line}`,
                    background: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AGlyph name="trash" size={13} color={AC.danger} />
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOne();
              }
            }}
            placeholder="New category name"
            style={{
              flex: 1,
              padding: "8px 11px",
              borderRadius: 8,
              border: `1px solid ${AC.line}`,
              fontFamily: AC.font,
              fontSize: 13,
            }}
          />
          <Btn size="sm" onClick={addOne} icon="plus" disabled={!newName.trim()}>
            Add
          </Btn>
        </div>

        {error && (
          <div
            style={{
              padding: "8px 10px",
              background: AC.dangerTint,
              color: "#9c1a3c",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn kind="primary" icon="check" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save categories"}
          </Btn>
        </div>
      </div>
    </>
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
