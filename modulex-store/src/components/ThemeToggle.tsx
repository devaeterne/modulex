"use client";

import { useEffect, useSyncExternalStore } from "react";

const THEME_EVENT = "oakwell-theme-change";
type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.body.classList.contains("dark") ? "dark" : "light";
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function applyTheme(theme: Theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);

  useEffect(() => {
    const canonical = window.localStorage.getItem("theme");
    const legacy = window.localStorage.getItem("oakwell-theme");
    const preferred = canonical ?? legacy;
    const initial: Theme = preferred === "dark" || preferred === "light"
      ? preferred
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

    applyTheme(initial);
    if (legacy !== null) window.localStorage.removeItem("oakwell-theme");
  }, []);

  const toggleTheme = () => applyTheme(theme === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      className="theme-toggle portal-theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
        <span className="toggle-icon toggle-icon--sun"><i className="bi bi-sun-fill" /></span>
        <span className="toggle-icon toggle-icon--moon"><i className="bi bi-moon-fill" /></span>
      </span>
    </button>
  );
}
