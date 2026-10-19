"use client";

import { useState } from "react";
import ThemeToggle from "../../ThemeToggle";
import NoteFields, { emptyDraft, type NoteDraft } from "../../NoteFields";

type Item = {
  id: string;
  label: string;
  status: "active" | "expired" | "viewed";
  viewsLeft: number;
  viewLimit: number;
  expiresAt: string;
  removeAt: string | null;
};

type Revealed = { text: string; viewsLeft: number };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CollectionClient({ slug, exists }: { slug: string; exists: boolean }) {
  const [missing, setMissing] = useState(!exists);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"viewer" | "owner" | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({});
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<NoteDraft>(emptyDraft);
  const [pwWhich, setPwWhich] = useState<"viewer" | "owner">("viewer");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const base = `/api/collections/${encodeURIComponent(slug)}`;

  async function call(path: string, method: string, body: object) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function showError(res: Response, data: { error?: string; remainingAttempts?: number }) {
    if (res.status === 404 && !role) {
      setMissing(true);
      return;
    }
    setError(
      (data.error || "Something went wrong.") +
        (typeof data.remainingAttempts === "number"
          ? ` (${data.remainingAttempts} tries left)`
          : "")
    );
  }

  async function open(pw: string = password) {
    setLoading(true);
    setError("");
    try {
      const { res, data } = await call("/open", "POST", { password: pw });
      if (!res.ok) {
        showError(res, data);
        return false;
      }
      setRole(data.role);
      setItems(data.notes);
      return true;
    } catch {
      setError("Could not reach the server. Try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function reveal(id: string) {
    setError("");
    try {
      const { res, data } = await call(`/notes/${id}/reveal`, "POST", { password });
      if (!res.ok) {
        showError(res, data);
        await open();
        return;
      }
      setRevealed((r) => ({ ...r, [id]: { text: data.text, viewsLeft: data.viewsLeft } }));
      await open();
    } catch {
      setError("Could not reach the server. Try again.");
    }
  }

  // Owner only: read a note without using a view.
  async function preview(id: string) {
    setError("");
    try {
      const { res, data } = await call(`/notes/${id}/preview`, "POST", { password });
      if (!res.ok) {
        showError(res, data);
        await open();
        return null;
      }
      setPreviews((p) => ({ ...p, [id]: data.text }));
      return data as { text: string; label: string; viewLimit: number; viewCount: number };
    } catch {
      setError("Could not reach the server. Try again.");
      return null;
    }
  }

  async function startEdit(id: string) {
    const data = await preview(id);
    if (!data) return;
    setEditDraft({
      label: data.label,
      text: data.text,
      viewLimit: data.viewLimit,
      hours: 24,
      keepExpiry: true,
    });
    setEditingId(id);
  }

  async function saveEdit() {
    if (!editingId) return;
    setError("");
    setLoading(true);
    try {
      const { res, data } = await call(`/notes/${editingId}`, "PATCH", {
        ...editDraft,
        password,
      });
      if (!res.ok) {
        showError(res, data);
        return;
      }
      setPreviews((p) => {
        const next = { ...p };
        delete next[editingId];
        return next;
      });
      setEditingId(null);
      await open();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function changePassword() {
    setError("");
    setPwMsg("");
    setLoading(true);
    try {
      const { res, data } = await call("/password", "PATCH", {
        password,
        which: pwWhich,
        newPassword: newPw,
      });
      if (!res.ok) {
        showError(res, data);
        return;
      }
      if (pwWhich === "owner") setPassword(newPw);
      setNewPw("");
      setPwMsg("Password changed.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      const { res, data } = await call(`/notes/${id}`, "DELETE", { password });
      if (!res.ok) {
        showError(res, data);
        return;
      }
      await open();
    } catch {
      setError("Could not reach the server. Try again.");
    }
  }

  async function addNote() {
    setError("");
    if (!draft.label.trim()) {
      setError("Add a label.");
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await call("/notes", "POST", { ...draft, password });
      if (!res.ok) {
        showError(res, data);
        return;
      }
      setDraft(emptyDraft);
      await open();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const header = (title: string) => (
    <div className="top-row">
      <div>
        <h1>{title}</h1>
        <p className="tagline">/c/{slug}</p>
      </div>
      <ThemeToggle />
    </div>
  );

  if (missing) {
    return (
      <main className="wrap">
        <div className="top-row">
          <h1>Not found</h1>
          <ThemeToggle />
        </div>
        <div className="card">
          <p>This link doesn't exist anymore.</p>
        </div>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="wrap">
        {header("Enter password")}
        <div className="card">
          <div className="field">
            <label htmlFor="cpw">Password</label>
            <input
              id="cpw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && open()}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="full-width" disabled={loading || !password} onClick={() => open()}>
            {loading ? "Checking…" : "Open"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      {header(role === "owner" ? "Manage notes" : "Notes")}

      {error && <p className="error">{error}</p>}

      <div className="note-list">
        {items.map((n) => {
          const shown = revealed[n.id];
          return (
            <div className="card note-item" key={n.id}>
              <div className="note-item-head">
                <strong>{n.label}</strong>
                <span className={`badge ${n.status}`}>
                  {n.status === "active" ? "Active" : n.status === "viewed" ? "Viewed" : "Expired"}
                </span>
              </div>

              <p className="muted">
                {n.status === "active"
                  ? `${n.viewsLeft} of ${n.viewLimit} views left. Expires ${fmt(n.expiresAt)}.`
                  : `Deleted. Leaves this list on ${fmt(n.removeAt as string)}.`}
              </p>

              {role === "owner" && previews[n.id] !== undefined && editingId !== n.id && (
                <>
                  <pre className="note-text">{previews[n.id]}</pre>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Owner view. No view used.
                  </p>
                </>
              )}

              {editingId === n.id && (
                <div style={{ marginTop: 8 }}>
                  <NoteFields draft={editDraft} onChange={setEditDraft} showLabel editing />
                  <div className="actions">
                    <button disabled={loading || !editDraft.text.trim()} onClick={saveEdit}>
                      {loading ? "Saving…" : "Save changes"}
                    </button>
                    <button className="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {shown && (
                <>
                  <pre className="note-text">{shown.text}</pre>
                  <p className="muted" style={{ marginTop: 8 }}>
                    {shown.viewsLeft === 0
                      ? "Last view used. This note is now deleted."
                      : `${shown.viewsLeft} ${shown.viewsLeft === 1 ? "view" : "views"} left.`}
                  </p>
                </>
              )}

              <div className="actions">
                {role === "viewer" && n.status === "active" && (
                  <button onClick={() => reveal(n.id)}>
                    {n.viewsLeft === 1 ? "Open (last view)" : "Open"}
                  </button>
                )}
                {role === "owner" && n.status === "active" && editingId !== n.id && (
                  <>
                    <button onClick={() => preview(n.id)}>View</button>
                    <button className="secondary" onClick={() => startEdit(n.id)}>
                      Edit
                    </button>
                  </>
                )}
                {role === "owner" && editingId !== n.id && (
                  <button className="secondary" onClick={() => remove(n.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {role === "owner" && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Add a note</h2>
          <NoteFields draft={draft} onChange={setDraft} showLabel />
          <button className="full-width" disabled={loading || !draft.text.trim()} onClick={addNote}>
            {loading ? "Adding…" : "Add note"}
          </button>
        </div>
      )}

      {role === "owner" && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Change a password</h2>
          <div className="field">
            <label htmlFor="pw-which">Which password</label>
            <select
              id="pw-which"
              value={pwWhich}
              onChange={(e) => setPwWhich(e.target.value as "viewer" | "owner")}
            >
              <option value="viewer">Viewer password (for readers)</option>
              <option value="owner">Owner password (yours)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-pw">New password</label>
            <input
              id="new-pw"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          {pwMsg && <p className="muted">{pwMsg}</p>}
          <button className="full-width" disabled={loading || !newPw} onClick={changePassword}>
            {loading ? "Saving…" : "Change password"}
          </button>
        </div>
      )}

      <p className="muted" style={{ marginTop: 16 }}>
        {role === "owner"
          ? "You are the owner. Viewing your notes does not use up views."
          : "Ended notes stay in this list for 3 days, without their content."}
      </p>
    </main>
  );
}
