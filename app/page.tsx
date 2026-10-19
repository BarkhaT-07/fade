"use client";

import { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import NoteFields, { emptyDraft, type NoteDraft } from "./NoteFields";
import { MIN_PASSWORD_LENGTH } from "@/lib/notes";

type Tab = "quick" | "password" | "custom";

const TAB_LABEL: Record<Tab, string> = {
  quick: "Quick note",
  password: "Password note",
  custom: "Custom link",
};

const TAB_HINT: Record<Tab, string> = {
  quick: "Anyone with the link can open it.",
  password: "Needs a password to open. 5 wrong tries delete it.",
  custom:
    "Pick your own link and add many notes to it. Readers use one password. You use another to manage.",
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("quick");
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft);
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [viewPassword, setViewPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const [link, setLink] = useState("");
  const [created, setCreated] = useState<{ tab: Tab; views: number; hours: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate(): string {
    if (tab === "password" && password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (tab === "custom") {
      if (!slug.trim()) return "Choose a link name.";
      if (viewPassword.length < MIN_PASSWORD_LENGTH || ownerPassword.length < MIN_PASSWORD_LENGTH) {
        return `Both passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      if (viewPassword === ownerPassword) {
        return "Use two different passwords.";
      }
      if (!draft.label.trim()) return "Add a label.";
    }
    return "";
  }

  async function create() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const isCustom = tab === "custom";
      const res = await fetch(isCustom ? "/api/collections" : "/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isCustom
            ? { ...draft, slug, viewPassword, ownerPassword }
            : { ...draft, password: tab === "password" ? password : undefined }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      const newLink = isCustom
        ? `${window.location.origin}/c/${data.slug}`
        : `${window.location.origin}/n/${data.id}`;
      setLink(newLink);
      setCreated({ tab, views: draft.viewLimit, hours: draft.hours });
      try {
        await navigator.clipboard.writeText(newLink);
        setCopied(true);
      } catch {}
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setDraft(emptyDraft);
    setPassword("");
    setSlug("");
    setViewPassword("");
    setOwnerPassword("");
    setLink("");
    setCreated(null);
    setCopied(false);
    setError("");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (link && created) {
    return (
      <main className="wrap">
        <div className="top-row">
          <div>
            <h1>Your link is ready</h1>
            <p className="tagline">Share it. Fade does the rest.</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="card">
          <div className="link-box">
            <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button onClick={copyLink}>{copied ? "Copied ✓" : "Copy"}</button>
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            {created.tab === "custom"
              ? "Send readers the link and the viewer password. Keep the owner password to yourself."
              : created.views === 1
              ? "This link works once, then it is gone."
              : `This link works ${created.views} times, or until it expires in ${created.hours} hours.`}
            {created.tab === "password" && " Send the password separately."}
          </p>
          <button className="secondary full-width" onClick={reset}>
            Create another
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <div className="top-row">
        <div>
          <h1>Fade</h1>
          <p className="tagline">Share text with a link that deletes itself.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="card">
        <div className="mode-select" role="tablist">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`mode-option ${tab === t ? "active" : ""}`}
              onClick={() => {
                setTab(t);
                setError("");
              }}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="mode-hint">{TAB_HINT[tab]}</p>

        {tab === "custom" && (
          <>
            <div className="field">
              <label htmlFor="slug">Link name</label>
              <div className="slug-row">
                <span className="muted">/c/</span>
                <input
                  id="slug"
                  type="text"
                  placeholder="my-team-notes"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="vpw">Viewer password (for readers)</label>
              <input
                id="vpw"
                type="password"
                value={viewPassword}
                onChange={(e) => setViewPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="opw">Owner password (for you only)</label>
              <input
                id="opw"
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
              />
            </div>
          </>
        )}

        {tab === "password" && (
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        <NoteFields draft={draft} onChange={setDraft} showLabel={tab === "custom"} />

        {error && <p className="error">{error}</p>}

        <button className="full-width" disabled={loading || !draft.text.trim()} onClick={create}>
          {loading ? "Creating…" : "Create link"}
        </button>
      </div>
    </main>
  );
}
