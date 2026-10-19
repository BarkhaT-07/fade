import {
  MAX_EXPIRY_HOURS,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_VIEWS,
  MIN_EXPIRY_HOURS,
  MIN_PASSWORD_LENGTH,
  MIN_VIEWS,
} from "@/lib/notes";

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set([
  "api", "n", "c", "admin", "new", "create", "static", "next", "login", "about",
]);

export function normalizeSlug(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

export function validateSlug(slug: string): string | null {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return `Link name must be ${SLUG_MIN} to ${SLUG_MAX} characters.`;
  }
  if (!SLUG_RE.test(slug)) {
    return "Use lowercase letters, numbers and hyphens only.";
  }
  if (RESERVED_SLUGS.has(slug)) return "That link name is reserved.";
  return null;
}

export function validatePassword(pw: string, what = "Password"): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `${what} must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(pw, "utf8") > MAX_PASSWORD_LENGTH) {
    return `${what} is too long (max ${MAX_PASSWORD_LENGTH}).`;
  }
  return null;
}

export type NoteFields = { text: string; label: string; viewLimit: number; hours: number };

/** Validates the fields shared by every kind of note. */
export function parseNoteFields(
  body: { text?: unknown; label?: unknown; viewLimit?: unknown; hours?: unknown },
  opts: { needLabel: boolean }
): { ok: true; value: NoteFields } | { ok: false; error: string } {
  const text = String(body.text ?? "");
  const label = String(body.label ?? "").trim();
  const viewLimit = Number(body.viewLimit ?? 1);
  const hours = Number(body.hours);

  if (!text.trim()) return { ok: false, error: "Write a note first." };
  if (text.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Note is too long (max ${MAX_NOTE_LENGTH}).` };
  }
  if (opts.needLabel && !label) return { ok: false, error: "Add a label." };
  if (label.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: `Label is too long (max ${MAX_LABEL_LENGTH}).` };
  }
  if (!Number.isInteger(viewLimit) || viewLimit < MIN_VIEWS || viewLimit > MAX_VIEWS) {
    return { ok: false, error: `Views must be ${MIN_VIEWS} to ${MAX_VIEWS}.` };
  }
  if (!Number.isFinite(hours) || hours < MIN_EXPIRY_HOURS || hours > MAX_EXPIRY_HOURS) {
    return {
      ok: false,
      error: `Expiry must be ${MIN_EXPIRY_HOURS} to ${MAX_EXPIRY_HOURS} hours.`,
    };
  }
  return { ok: true, value: { text, label, viewLimit, hours } };
}
