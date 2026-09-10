export default function AdminLoading() {
  return (
    <div
      className="flex min-h-[320px] items-center justify-center rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading Modulex Admin…</p>
      </div>
    </div>
  );
}
