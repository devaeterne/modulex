"use client";

import { useEffect } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "oakwell-theme";

function applyTheme(theme: Theme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export default function AccountThemeToggle() {
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: Theme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    applyTheme(initial);
  }, []);

  const toggleTheme = () => {
    const next: Theme = document.body.classList.contains("dark") ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      className="account-theme-toggle"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      <span aria-hidden="true">◐</span>
    </button>
  );
}
