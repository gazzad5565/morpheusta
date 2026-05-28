/**
 * /settings/custom-fields — kept as a redirect (May 28).
 *
 * Custom-field management moved into the Site settings hub as a tab
 * (Gary: "custom fields should belong in site settings"). The list +
 * CRUD now lives at /settings/organisation (Site settings) under the
 * "Custom fields" tab via <CustomFieldsManager />. This route is
 * preserved so old bookmarks + the field new/edit forms' post-save
 * redirects land on the right tab instead of 404-ing.
 */

import { redirect } from "next/navigation";

export default function CustomFieldsRedirect() {
  redirect("/settings/organisation?tab=custom-fields");
}
