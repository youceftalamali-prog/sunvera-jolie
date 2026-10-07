"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "sunvera-theme";

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Ignore storage failures.
  }
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial = readTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={
        compact
          ? "flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--svj-border)] bg-white text-sm text-[var(--svj-muted)] shadow-sm transition hover:border-gold hover:text-[var(--svj-foreground)]"
          : "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--svj-border)] bg-white text-sm text-[var(--svj-muted)] transition hover:border-gold hover:text-[var(--svj-foreground)]"
      }
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
