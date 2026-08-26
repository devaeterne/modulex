"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";
import { supabase } from "@/lib/supabase/client";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 transition-colors focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:bg-white/[0.03] dark:disabled:text-gray-500";

const labelClass =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

function getInitials(fullName: string | null, email: string | null) {
  const cleanName = fullName?.trim() ?? "";

  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toLocaleUpperCase();
    }

    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toLocaleUpperCase();
  }

  return email?.charAt(0).toLocaleUpperCase() || "U";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export default function CorporateProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const displayEmail = authEmail || profile?.email || "—";
  const initials = useMemo(
    () => getInitials(profile?.full_name ?? null, displayEmail === "—" ? null : displayEmail),
    [profile?.full_name, displayEmail]
  );

  const roleLabel = profile?.role ? ROLE_LABELS[profile.role] : "—";

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      const [profileResult, authResult] = await Promise.all([
        getCurrentProfile(),
        supabase.auth.getUser(),
      ]);

      if (!mounted) return;

      if (profileResult.error || !profileResult.profile) {
        setError(profileResult.error?.message || "Profile could not be loaded.");
        setLoading(false);
        return;
      }

      const currentProfile = profileResult.profile;

      setProfile(currentProfile);
      setFullName(currentProfile.full_name ?? "");
      setPhone(currentProfile.phone ?? "");
      setAuthEmail(authResult.data.user?.email ?? currentProfile.email ?? null);
      setLoading(false);
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  function cancelEdit() {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setIsEditing(false);
    setError(null);
    setSuccess(null);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) return;

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();

    if (!cleanName) {
      setError("Name and surname are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: cleanName,
        phone: cleanPhone || null,
      })
      .eq("id", profile.id)
      .select("*")
      .single();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const updatedProfile = data as Profile;

    setProfile(updatedProfile);
    setFullName(updatedProfile.full_name ?? "");
    setPhone(updatedProfile.phone ?? "");
    setIsEditing(false);
    setSuccess("Profile information updated successfully.");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex min-h-[360px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && !profile && (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {profile && (
        <>
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <svg
                    viewBox="0 0 80 80"
                    role="img"
                    aria-label={`${initials} profile initials`}
                    className="h-16 w-16 shrink-0 rounded-2xl text-brand-600 shadow-theme-xs dark:text-brand-400 sm:h-20 sm:w-20"
                  >
                    <rect width="80" height="80" rx="20" className="fill-brand-50 dark:fill-brand-500/10" />
                    <text
                      x="40"
                      y="43"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="currentColor"
                      fontSize="25"
                      fontWeight="600"
                      letterSpacing="0.5"
                    >
                      {initials}
                    </text>
                  </svg>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
                        {profile.full_name || "Unnamed user"}
                      </h1>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          profile.is_active
                            ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                            : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            profile.is_active ? "bg-success-500" : "bg-gray-400"
                          }`}
                        />
                        {profile.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{displayEmail}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                        {roleLabel}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Member since {formatDate(profile.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gray-200 dark:bg-gray-800 sm:grid-cols-3">
              <div className="bg-white px-5 py-4 dark:bg-gray-900">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Account</p>
                <p className="mt-1.5 text-sm font-medium text-gray-800 dark:text-white/90">Modulex Admin</p>
              </div>
              <div className="bg-white px-5 py-4 dark:bg-gray-900">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Assigned role</p>
                <p className="mt-1.5 text-sm font-medium text-gray-800 dark:text-white/90">{roleLabel}</p>
              </div>
              <div className="bg-white px-5 py-4 dark:bg-gray-900">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Last updated</p>
                <p className="mt-1.5 text-sm font-medium text-gray-800 dark:text-white/90">{formatDate(profile.updated_at)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Personal Information</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Your contact information used across the Modulex administration system.
                </p>
              </div>

              {!isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05] sm:w-auto"
                >
                  Edit information
                </button>
              )}
            </div>

            <form onSubmit={saveProfile} className="p-5 sm:p-6">
              {(error || success) && (
                <div
                  className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
                    error
                      ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
                      : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
                  }`}
                >
                  {error ?? success}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Name & Surname</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    disabled={!isEditing || saving}
                    className={inputClass}
                    placeholder="Name Surname"
                  />
                </div>

                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={!isEditing || saving}
                    className={inputClass}
                    placeholder="+382 ..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Email</label>
                  <input type="email" value={displayEmail} disabled className={inputClass} />
                  <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Email is part of your sign-in identity and is managed through account administration.
                  </p>
                </div>
              </div>

              {isEditing && (
                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05] sm:w-auto"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              )}
            </form>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Access & Role</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Account permissions are assigned centrally by an administrator and cannot be changed from your profile.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 p-5 sm:p-6 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Assigned role</p>
                <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">{roleLabel}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  This role controls access to Modulex modules and administrative actions.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Account status</p>
                <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {profile.is_active ? "Active" : "Inactive"}
                </p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Account activation and access status are controlled by an administrator.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
