"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const shouldBeDark =
      savedTheme === "dark" || (!savedTheme && systemPrefersDark);

    setIsDark(shouldBeDark);
    document.body.classList.toggle("dark", shouldBeDark);
  }, []);

  const toggleTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextIsDark = e.target.checked;

    setIsDark(nextIsDark);
    document.body.classList.toggle("dark", nextIsDark);
    localStorage.setItem("theme", nextIsDark ? "dark" : "light");
  };

  return (
    <label
      className="theme-toggle"
      htmlFor="dark-toggle"
      title="Toggle dark mode"
    >
      <input
        type="checkbox"
        id="dark-toggle"
        hidden
        checked={isDark}
        onChange={toggleTheme}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb"></span>
        <span className="toggle-icon toggle-icon--sun">
          <i className="bi bi-sun-fill"></i>
        </span>
        <span className="toggle-icon toggle-icon--moon">
          <i className="bi bi-moon-fill"></i>
        </span>
      </span>
    </label>
  );
}
