"use client";

import { useEffect, useState } from "react";
import {
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_VIEWS,
} from "@/lib/notes";

export type NoteDraft = {
  label: string;
  text: string;
  viewLimit: number;
  hours: number;
  keepExpiry: boolean;
};

const EXPIRY_OPTIONS = [24, 48, 72];

export const emptyDraft: NoteDraft = { label: "", text: "", viewLimit: 1, hours: 24, keepExpiry: false };

function formatExpiry(hours: number): string {
  const when = new Date(Date.now() + hours * 3600 * 1000);
  return when.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NoteFields({
  draft,
  onChange,
  showLabel,
  editing = false,
}: {
  draft: NoteDraft;
  onChange: (d: NoteDraft) => void;
  showLabel: boolean;
  editing?: boolean;
}) {
  const [expiryLabel, setExpiryLabel] = useState("");
  useEffect(() => {
    setExpiryLabel(formatExpiry(draft.hours));
  }, [draft.hours]);

  const nearLimit = draft.text.length > MAX_NOTE_LENGTH * 0.9;
  const set = (patch: Partial<NoteDraft>) => onChange({ ...draft, ...patch });

  return (
    <>
      {showLabel && (
        <div className="field">
          <label htmlFor="note-label">Label (shown in the list)</label>
          <input
            id="note-label"
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            placeholder="e.g. Wi-Fi details"
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>
      )}

      <textarea
        placeholder="Write your note here…"
        value={draft.text}
        maxLength={MAX_NOTE_LENGTH}
        onChange={(e) => set({ text: e.target.value })}
      />
      <div className={`char-count ${nearLimit ? "near-limit" : ""}`}>
        {draft.text.length} / {MAX_NOTE_LENGTH}
      </div>

      <div className="field">
        <label htmlFor="views">Number of views</label>
        <select
          id="views"
          value={draft.viewLimit}
          onChange={(e) => set({ viewLimit: Number(e.target.value) })}
        >
          {Array.from({ length: MAX_VIEWS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 view (deleted after reading)" : `${n} views`}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        {editing && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.keepExpiry}
              onChange={(e) => set({ keepExpiry: e.target.checked })}
            />
            Keep current expiry
          </label>
        )}
        <label htmlFor="hours">{editing && !draft.keepExpiry ? "New expiry" : "Expires in"}</label>
        <select
          id="hours"
          value={draft.hours}
          disabled={editing && draft.keepExpiry}
          onChange={(e) => set({ hours: Number(e.target.value) })}
        >
          {EXPIRY_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </select>
        {!(editing && draft.keepExpiry) && (
          <p className="muted" style={{ marginTop: 6 }} suppressHydrationWarning>
            Expires {expiryLabel}
          </p>
        )}
      </div>
    </>
  );
}
