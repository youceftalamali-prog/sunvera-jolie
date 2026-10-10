"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem("sunvera-theme", theme);
  } catch {
    // The theme still works for this session if storage is unavailable.
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("sunvera-theme");
    } catch {
      // Ignore storage access errors.
    }
    const initial: Theme = saved === "dark" || saved === "light"
      ? saved
      : document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initial;
    setTheme(initial);
  }, []);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--svj-border)] bg-[var(--svj-surface)] text-[var(--svj-text)] transition hover:opacity-80"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}
