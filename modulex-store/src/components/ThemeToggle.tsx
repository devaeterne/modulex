"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check URL param first
    const themeParam = searchParams.get("theme");
    
    // Check local storage or system preference
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    let shouldBeDark = false;

    if (themeParam === "dark") {
        shouldBeDark = true;
    } else if (themeParam === "light") {
        shouldBeDark = false;
    } else if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        shouldBeDark = true;
    }

    if (shouldBeDark) {
      setIsDark(true);
      document.body.classList.add("dark");
      // If it was from param, maybe save it? User intent seems clear.
      if (themeParam) localStorage.setItem("theme", "dark");
    } else {
      setIsDark(false);
      document.body.classList.remove("dark");
      if (themeParam) localStorage.setItem("theme", "light");
    }
    
    // Clean up URL if theme param exists (optional, but cleaner)
    if (themeParam) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("theme");
        // replace url without refreshing
        window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    }

  }, [searchParams, pathname]);

  const toggleTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setIsDark(isChecked);

    if (isChecked) {
      document.body.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
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
      <span className="toggle-track">
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
