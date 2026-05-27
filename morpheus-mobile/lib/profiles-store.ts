/**
 * Profiles store (mobile) — read + update the current user's profile.
 *
 * Profiles auto-populate via a Supabase trigger on auth.users INSERT.
 * Each user can read all profiles (so the app can show names of other reps
 * elsewhere) and update only their own.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  /** Base64 data URL of the rep's profile photo (small avatar).
   *  Uploaded from /profile via updateMyAvatar(). Null = generic
   *  face glyph fallback in UIs that render an avatar. */
  avatar_url: string | null;
  /** Rep category (Sales Rep / Merchandiser / Driver / …) managed
   *  on the admin side via /settings/managers → Manage rep types.
   *  Drives client-side capability checks via repTypeCan() — e.g.
   *  whether to show the Add Customer affordance. NULL =
   *  uncategorised (allow-all). Only meaningful when role='rep'. */
  rep_type: string | null;
}

export async function getMyProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, avatar_url, rep_type")
    .eq("id", userId)
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] getMy:", error.message);
    return null;
  }
  return data as Profile;
}

export async function updateMyName(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Supabase not configured" };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };
  const trimmed = name.trim();
  const { error } = await supabase
    .from("profiles")
    .update({ name: trimmed || null })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Change my own email address.
 *
 * Goes through Supabase Auth (not the profiles row directly) because
 * email is the auth identity. Supabase sends a confirmation link to
 * the NEW address; the change isn't applied until the rep clicks it,
 * so we return ok:true + a flag to the caller can show
 * "Confirm via the email we just sent" copy.
 *
 * The profiles.email column is kept in sync via the same auth.users
 * trigger that seeds new profiles — once the rep confirms, the next
 * page load reads the updated value.
 */
export async function updateMyEmail(
  newEmail: string
): Promise<{ ok: boolean; error?: string; confirmationRequired?: boolean }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase not configured" };
  }
  const trimmed = newEmail.trim();
  if (!trimmed) return { ok: false, error: "Email is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "That doesn't look like a valid email address." };
  }
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.email === trimmed) {
    return { ok: false, error: "That's already your email." };
  }
  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) return { ok: false, error: error.message };
  return { ok: true, confirmationRequired: true };
}

/**
 * Change my own password. Supabase doesn't require the old password
 * for an already-authenticated session — possession of the session
 * IS the proof of identity. Minimum 6 chars to match Supabase's own
 * default policy.
 */
export async function updateMyPassword(
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase not configured" };
  }
  if (newPassword.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Compress an image file to a small avatar-sized JPEG data URL.
 *
 *   - Resizes the longest side to `maxSize` (default 96px) so the
 *     base64 payload stays in the low tens of KB.
 *   - JPEG quality 0.82 — visibly fine at avatar size, tight on bytes.
 *   - Pre-flight check: rejects files over ~12MB before decode so we
 *     don't blow up on a phone with a 50MP camera.
 *
 * The output is a self-contained data: URL safe to write straight into
 * profiles.avatar_url. Storage in a `text` column is intentional —
 * Supabase Storage would be cleaner but needs a bucket + policies, and
 * avatars at this size (~10KB) fit comfortably in a row.
 */
export async function compressAvatar(
  file: File,
  maxSize = 96
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (file.size > 12 * 1024 * 1024) {
    return { ok: false, error: "That image is over 12 MB — try a smaller photo." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That file isn't an image." };
  }
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode that image."));
    img.src = URL.createObjectURL(file);
  }).catch((e) => e as Error);
  if (bitmap instanceof Error) return { ok: false, error: bitmap.message };

  // Square-crop to the smaller dimension so the avatar isn't squashed.
  // The face is almost always near the centre of a portrait or a
  // landscape shot, so a centred square crop gives a sensible default.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "Canvas not available in this browser." };
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, maxSize, maxSize);
  // toDataURL → JPEG @ 0.82 quality. JPEG keeps the size down vs PNG
  // and the loss is invisible at 96px.
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  URL.revokeObjectURL(bitmap.src);
  return { ok: true, dataUrl };
}

/**
 * Save a base64 data URL to the user's profiles.avatar_url. Passing
 * an empty string clears it.
 */
export async function updateMyAvatar(
  dataUrl: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Supabase not configured" };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };
  const value = dataUrl && dataUrl.length > 0 ? dataUrl : null;
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: value })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
