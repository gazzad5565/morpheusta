"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import {
  CustomFieldForm,
  type CustomFieldFormValues,
} from "@/components/ui/CustomFieldForm";
import {
  createCustomField,
  FIELD_ENTITIES,
  type FieldEntity,
} from "@/lib/custom-fields-store";

export default function NewFieldPageWrapper() {
  return (
    <Suspense fallback={null}>
      <NewFieldPage />
    </Suspense>
  );
}

function NewFieldPage() {
  const router = useRouter();
  const params = useSearchParams();
  const fromEntity = params.get("entity") || "";
  const initialEntity: FieldEntity = (FIELD_ENTITIES as readonly string[]).includes(fromEntity)
    ? (fromEntity as FieldEntity)
    : "customer";

  const [busy, setBusy] = useState(false);

  const initial: CustomFieldFormValues = {
    applies_to: initialEntity,
    name: "",
    field_type: "text",
    options: [],
    required: false,
    sort_order: 0,
  };

  const onSave = async (values: CustomFieldFormValues) => {
    setBusy(true);
    const r = await createCustomField({
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

  return (
    <AdminShell breadcrumbs={["Home", "Settings", "New field"]}>
      <CustomFieldForm
        initial={initial}
        busy={busy}
        onSubmit={onSave}
        onCancel={() => router.push("/settings")}
        saveLabel="Create field"
      />
    </AdminShell>
  );
}
