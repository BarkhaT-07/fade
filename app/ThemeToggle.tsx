"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let t: Theme = "light";
    try {
      const stored = localStorage.getItem("fade-theme");
      if (stored === "dark" || stored === "light") {
        t = stored;
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        t = "dark";
      }
    } catch {}
    document.documentElement.setAttribute("data-theme", t);
    setTheme(t);
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("fade-theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label="Toggle light/dark theme"
      suppressHydrationWarning
    >
      {!ready ? "Theme" : theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
