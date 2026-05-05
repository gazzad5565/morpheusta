"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AC } from "@/lib/tokens";
import {
  CustomFieldForm,
  type CustomFieldFormValues,
} from "@/components/ui/CustomFieldForm";
import {
  getCustomField,
  updateCustomField,
  deleteCustomField,
} from "@/lib/custom-fields-store";

export default function EditFieldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [initial, setInitial] = useState<CustomFieldFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomField(id).then((f) => {
      if (cancelled) return;
      if (!f) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setInitial({
        applies_to: f.applies_to,
        name: f.name,
        field_type: f.field_type,
        options: f.options || [],
        required: f.required,
        sort_order: f.sort_order,
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async (values: CustomFieldFormValues) => {
    setBusy(true);
    const r = await updateCustomField(id, {
      applies_to: values.applies_to,
      name: values.name,
      field_type: values.field_type,
      options: values.options,
      required: values.required,
      sort_order: values.sort_order,
    });
    setBusy(false);
    if (!r.ok) {
      alert(`Couldn't save: ${r.error}`);
      return;
    }
    router.push("/settings");
  };

  const onDelete = async () => {
    if (
      !confirm(
        `Delete this field?\n\nAll values stored against it will be wiped on every entity that has this field set.`
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await deleteCustomField(id);
    setBusy(false);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    router.push("/settings");
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Settings", "…"]}>
        <div style={{ padding: 32, fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
          Loading…
        </div>
      </AdminShell>
    );
  }

  if (notFound || !initial) {
    return (
      <AdminShell breadcrumbs={["Home", "Settings", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink, marginBottom: 8 }}>
              No field found with this ID.
            </div>
            <Btn onClick={() => router.push("/settings")}>Back to Settings</Btn>
          </Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell breadcrumbs={["Home", "Settings", { label: initial.name || "Edit field" }]}>
      <CustomFieldForm
        initial={initial}
        busy={busy}
        onSubmit={onSave}
        onDelete={onDelete}
        onCancel={() => router.push("/settings")}
        saveLabel="Save changes"
      />
    </AdminShell>
  );
}
