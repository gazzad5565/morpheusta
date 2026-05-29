"use client";

/**
 * /library/[id]/edit — edit a single library file's metadata.
 *
 * The file binary in Storage is untouched. Only name / category /
 * customer association change here.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import {
  getLibraryFile,
  updateLibraryFile,
  deleteLibraryFile,
  formatFileSize,
  listLibraryCategoriesInUse,
  LIBRARY_CATEGORIES,
  DEFAULT_CATEGORY,
  type LibraryFile,
} from "@/lib/library-store";
import { getLibraryCategories } from "@/lib/settings-store";
import { CustomerScopePicker, type CustomerScope } from "@/components/ui/CustomerScopePicker";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import { LibraryFilePreview } from "@/components/library/LibraryFilePreview";
import { PageLoading } from "@/components/ui/PageLoading";
import type { Customer } from "@/lib/types";

export default function EditLibraryFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [file, setFile] = useState<LibraryFile | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [scope, setScope] = useState<CustomerScope>(null);
  // Dynamic category options — union of the hardcoded defaults, the
  // manager-curated list (`app_settings.library_categories`), and any
  // free-text categories already in use on files in this tenant.
  // Same shape the /library list page uses; Mariska's B6.
  const [categoryOptions, setCategoryOptions] = useState<string[]>(
    () => [...LIBRARY_CATEGORIES]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-place file preview modal (Gary, May 29) — replaces the old
  // open-in-a-new-tab flow. The modal signs its own Storage URL and
  // shows its own loading state. false = closed.
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCustomers(),
      getLibraryFile(id),
      getLibraryCategories(),
      listLibraryCategoriesInUse(),
    ]).then(([cs, f, managed, inUse]) => {
      if (cancelled) return;
      setCustomers(cs);
      if (!f) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setFile(f);
      setName(f.name);
      setCategory(f.category || DEFAULT_CATEGORY);
      setScope(f.customerIds);
      // Build the union: defaults + manager-curated + in-use. Sort +
      // dedupe. Whatever the file's current category is is guaranteed
      // to be in `inUse` so it's selectable.
      const union = new Set<string>([
        ...LIBRARY_CATEGORIES,
        ...managed,
        ...inUse,
      ]);
      setCategoryOptions(
        Array.from(union).sort((a, b) => a.localeCompare(b))
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Give the file a name.");
    const trimmedCategory = category.trim();
    if (!trimmedCategory) return setError("Pick or type a category.");
    if (scope !== null && scope.length === 0) {
      return setError("Pick at least one customer, or switch to 'Shared with all'.");
    }

    setBusy(true);
    const r = await updateLibraryFile(id, {
      name: name.trim(),
      category: trimmedCategory,
      customerIds: scope,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    router.push("/library");
  };

  // Open the file in an in-place preview modal (Gary, May 29) instead
  // of punting it to a new browser tab. The modal signs its own
  // short-lived Storage URL and previews images / PDFs inline.
  const onOpenFile = () => {
    if (!file) return;
    setPreviewOpen(true);
  };

  const onDelete = async () => {
    if (!file) return;
    if (!confirm(`Delete "${file.name}"? This removes the file from storage.`)) return;
    setBusy(true);
    const r = await deleteLibraryFile(file);
    setBusy(false);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    router.push("/library");
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Library", "…"]}>
        <PageLoading label="Loading file…" />
      </AdminShell>
    );
  }

  if (notFound || !file) {
    return (
      <AdminShell breadcrumbs={["Home", "Library", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink, marginBottom: 8 }}>
              No file found with this ID.
            </div>
            <Btn onClick={() => router.push("/library")}>Back to Library</Btn>
          </Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      breadcrumbs={["Home", "Library", { label: name || "Edit file" }]}
      actions={
        // Primary "View file" action — clicking signs a Supabase
        // Storage URL + opens in a new tab. Loading state on the
        // button so the manager sees something happen during the
        // signed-URL round-trip. May 28 late (Gary: "let me know
        // it's loading because sometimes people don't know what is
        // going on").
        <Btn kind="primary" icon="eye" onClick={onOpenFile} disabled={!file}>
          View file
        </Btn>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Edit file</SectionTitle>

          <Field label="Display name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field
            label="Category"
            hint="Pick an existing category or type a new one to create it."
            required
          >
            {/* Free-text input with datalist suggestions — same picker
                shape the upload form uses on /library. Options are a
                union of the defaults, the manager-curated list (from
                app_settings.library_categories), and any categories
                already in use on files. Mariska's B6: before this, the
                edit page bound to the hardcoded LIBRARY_CATEGORIES so
                a file uploaded under "Brand Guidelines" couldn't be
                re-saved with that category — the dropdown didn't list
                it. The DB column is free-text so no migration needed. */}
            <input
              type="text"
              list="library-edit-category-list"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Documents, Onboarding, Compliance…"
              style={inputStyle}
            />
            <datalist id="library-edit-category-list">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Customers" hint="Pick all (universal), one, or many.">
            <CustomerScopePicker
              customers={customers}
              value={scope}
              onChange={setScope}
              allLabel="Shared with all"
              allSubLabel="Every customer can see it"
              specificLabel="Specific customers"
              specificSubLabel="Pick one or many"
            />
          </Field>

          {error && (
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
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Btn kind="danger" onClick={onDelete} disabled={busy}>
              Delete
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => router.push("/library")}>Cancel</Btn>
              <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={16}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              File details
            </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.ink2,
              lineHeight: 1.7,
            }}
          >
            <div>
              <b>Type:</b> {file.mimeType || "—"}
            </div>
            <div>
              <b>Size:</b> {formatFileSize(file.sizeBytes)}
            </div>
            <div>
              <b>Uploaded:</b>{" "}
              {new Date(file.uploadedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "9px 11px",
              borderRadius: 8,
              background: AC.bg,
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              lineHeight: 1.4,
            }}
          >
            To replace the file content, delete this entry and re-upload from the Library page.
          </div>
        </Card>
        <CustomFieldsCard entity="library_file" entityId={id} />
        </div>
      </div>
      <LibraryFilePreview
        file={previewOpen ? file : null}
        onClose={() => setPreviewOpen(false)}
      />
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
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
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
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
