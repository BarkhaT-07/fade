"use client";

import { useState } from "react";
import type { NoteScreen } from "@/lib/notes";
import ThemeToggle from "../../ThemeToggle";

export default function NoteClient({
  id,
  initialScreen,
  initialViewsLeft,
}: {
  id: string;
  initialScreen: NoteScreen;
  initialViewsLeft: number;
}) {
  const [screen, setScreen] = useState<NoteScreen>(initialScreen);
  const [password, setPassword] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [viewsLeft, setViewsLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function reveal() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/notes/${id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      const data = await res.json();

      if (res.status === 404) {
        setScreen("not-found");
        return;
      }
      if (res.status === 401) {
        setError(
          data.error +
            (typeof data.remainingAttempts === "number"
              ? ` (${data.remainingAttempts} tries left)`
              : "")
        );
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setText(data.text);
      setViewsLeft(typeof data.viewsLeft === "number" ? data.viewsLeft : null);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const header = (
    <div className="top-row">
      <h1>{text !== null ? "Note" : screen === "not-found" ? "Not found" : "You've received a note"}</h1>
      <ThemeToggle />
    </div>
  );

  if (text !== null) {
    return (
      <main className="wrap">
        {header}
        <div className="card">
          <pre className="note-text">{text}</pre>
          <p className="muted" style={{ marginTop: 12 }}>
            {viewsLeft === 0
              ? "This note is now deleted. Copy it if you need it."
              : `${viewsLeft} more ${viewsLeft === 1 ? "view" : "views"} left.`}
          </p>
        </div>
      </main>
    );
  }

  if (screen === "not-found") {
    return (
      <main className="wrap">
        {header}
        <div className="card">
          <p>
            This note doesn't exist, was already read, or has expired.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      {header}
      <div className="card">
        {screen === "confirm" && (
          <p>
            This note will be deleted as soon as you open it.
          </p>
        )}

        {screen === "plain" && (
          <p>
            You can open this note {initialViewsLeft} more times.
          </p>
        )}

        {screen === "password" && (
          <div className="field">
            <label htmlFor="pw">This note needs a password</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the password"
            />
            <p className="muted" style={{ marginTop: 8 }}>
              {initialViewsLeft === 1
                ? "It will be deleted once you open it."
                : `You can open it ${initialViewsLeft} more times.`}
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <button className="full-width" disabled={loading} onClick={reveal}>
          {loading ? "Checking…" : "Open note"}
        </button>
      </div>
    </main>
  );
}
