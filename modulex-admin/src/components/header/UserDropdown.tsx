"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { getCurrentProfile, Profile } from "@/lib/supabase/profile";
import { signOut } from "@/lib/supabase/auth";
import { ROLE_LABELS } from "@/lib/auth/permissions";

function getInitials(name: string, email: string) {
  const cleanName = name.trim();

  if (cleanName) {
    return cleanName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  return email.charAt(0).toUpperCase() || "U";
}

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = useMemo(() => {
    if (profile?.full_name?.trim()) {
      return profile.full_name.trim();
    }

    if (profile?.email) {
      return profile.email.split("@")[0];
    }

    return "Modulex User";
  }, [profile]);

  const displayEmail = profile?.email ?? "";
  const displayRole = profile?.role
    ? ROLE_LABELS[profile.role]
    : "User";

  const initials = getInitials(displayName, displayEmail);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { profile: currentProfile } = await getCurrentProfile();

      if (mounted) {
        setProfile(currentProfile);
      }
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  function toggleDropdown(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setIsOpen((current) => !current);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);

    const { error } = await signOut();

    if (error) {
      console.error("Sign out failed:", error.message);
      setIsSigningOut(false);
      return;
    }

    setIsOpen(false);
    window.location.replace("/signin");
  }

  return (
    <div className="relative">
      {/* USER BUTTON */}
      <button
        type="button"
        onClick={toggleDropdown}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="
          group flex items-center gap-3
          rounded-lg
          px-2 py-1.5
          text-left
          transition-colors duration-200
          hover:bg-gray-100
          focus:outline-none
          focus:ring-2
          focus:ring-brand-500/20
          dark:hover:bg-white/[0.05]
        "
      >
        {/* AVATAR */}
        <span
          className="
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-full
            bg-brand-50
            text-sm font-semibold
            text-brand-600
            ring-1 ring-brand-100
            transition-colors
            dark:bg-brand-500/15
            dark:text-brand-400
            dark:ring-brand-500/20
          "
        >
          {initials}
        </span>

        {/* USER INFO */}
        <span className="hidden min-w-0 sm:block">
          <span
            className="
              block max-w-[150px] truncate
              text-sm font-medium
              text-gray-700
              dark:text-gray-300
            "
          >
            {displayName}
          </span>

          <span
            className="
              mt-0.5 block
              max-w-[150px] truncate
              text-xs
              text-gray-500
              dark:text-gray-400
            "
          >
            {displayRole}
          </span>
        </span>

        {/* CHEVRON */}
        <svg
          className={`
            hidden shrink-0
            stroke-gray-500
            transition-transform duration-200
            group-hover:stroke-gray-700
            dark:stroke-gray-400
            dark:group-hover:stroke-gray-300
            sm:block
            ${isOpen ? "rotate-180" : ""}
          `}
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 7L9 11.6875L13.6875 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* DROPDOWN */}
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="
          absolute right-0 z-50
          mt-3
          flex w-[290px] flex-col
          overflow-hidden
          rounded-2xl
          border border-gray-200
          bg-white
          p-2
          shadow-theme-lg
          dark:border-gray-800
          dark:bg-gray-dark
        "
      >
        {/* PROFILE SUMMARY */}
        <div
          className="
            rounded-xl
            border border-gray-100
            bg-gray-50
            p-3
            dark:border-gray-800
            dark:bg-white/[0.03]
          "
        >
          <div className="flex items-center gap-3">
            <span
              className="
                flex h-11 w-11 shrink-0
                items-center justify-center
                rounded-full
                bg-brand-50
                text-sm font-semibold
                text-brand-600
                ring-1 ring-brand-100
                dark:bg-brand-500/15
                dark:text-brand-400
                dark:ring-brand-500/20
              "
            >
              {initials}
            </span>

            <div className="min-w-0 flex-1">
              <span
                className="
                  block truncate
                  text-sm font-semibold
                  text-gray-800
                  dark:text-white/90
                "
              >
                {displayName}
              </span>

              {displayEmail && (
                <span
                  className="
                    mt-0.5 block truncate
                    text-xs
                    text-gray-500
                    dark:text-gray-400
                  "
                >
                  {displayEmail}
                </span>
              )}
            </div>
          </div>

          {/* ROLE */}
          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
            <span
              className="
                inline-flex items-center
                rounded-full
                bg-brand-50
                px-2.5 py-1
                text-xs font-medium
                text-brand-600
                ring-1 ring-inset ring-brand-100
                dark:bg-brand-500/10
                dark:text-brand-400
                dark:ring-brand-500/20
              "
            >
              {displayRole}
            </span>
          </div>
        </div>

        {/* MENU */}
        <ul
          className="
            mt-2
            border-b border-gray-200
            pb-2
            dark:border-gray-800
          "
        >
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              href="/profile"
              className="
                group flex items-center gap-3
                rounded-lg
                px-3 py-2.5
                text-sm font-medium
                text-gray-700
                transition-colors duration-150
                hover:bg-gray-100
                hover:text-gray-900
                dark:text-gray-400
                dark:hover:bg-white/[0.05]
                dark:hover:text-gray-200
              "
            >
              <svg
                className="
                  fill-gray-500
                  transition-colors
                  group-hover:fill-gray-700
                  dark:fill-gray-400
                  dark:group-hover:fill-gray-300
                "
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 14.1526 4.3002 16.1184 5.61936 17.616C6.17279 15.3096 8.24852 13.5955 10.7246 13.5955H13.2746C15.7509 13.5955 17.8268 15.31 18.38 17.6167C19.6996 16.119 20.5 14.153 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5ZM17.0246 18.8566V18.8455C17.0246 16.7744 15.3457 15.0955 13.2746 15.0955H10.7246C8.65354 15.0955 6.97461 16.7744 6.97461 18.8455V18.856C8.38223 19.8895 10.1198 20.5 12 20.5C13.8798 20.5 15.6171 19.8898 17.0246 18.8566ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM11.9991 7.25C10.8847 7.25 9.98126 8.15342 9.98126 9.26784C9.98126 10.3823 10.8847 11.2857 11.9991 11.2857C13.1135 11.2857 14.0169 10.3823 14.0169 9.26784C14.0169 8.15342 13.1135 7.25 11.9991 7.25ZM8.48126 9.26784C8.48126 7.32499 10.0563 5.75 11.9991 5.75C13.9419 5.75 15.5169 7.32499 15.5169 9.26784C15.5169 11.2107 13.9419 12.7857 11.9991 12.7857C10.0563 12.7857 8.48126 11.2107 8.48126 9.26784Z"
                />
              </svg>

              <span>Profile</span>
            </DropdownItem>
          </li>
        </ul>

        {/* SIGN OUT */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="
            group
            mt-2 flex w-full items-center gap-3
            rounded-lg
            px-3 py-2.5
            text-left
            text-sm font-medium
            text-error-600
            transition-colors duration-150
            hover:bg-error-50
            disabled:cursor-not-allowed
            disabled:opacity-60
            dark:text-error-400
            dark:hover:bg-error-500/10
          "
        >
          <svg
            className="
              fill-current
              transition-transform duration-150
              group-hover:translate-x-0.5
            "
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z"
            />
          </svg>

          <span>
            {isSigningOut ? "Signing out..." : "Sign out"}
          </span>
        </button>
      </Dropdown>
    </div>
  );
}