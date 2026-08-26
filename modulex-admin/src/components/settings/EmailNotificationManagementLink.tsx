import Link from "next/link";

export default function EmailNotificationManagementLink() {
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Email Queue & Delivery Log</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">See pending, sent, failed and skipped transactional emails. Retry failures, skip queued items and manually process the queue.</p>
        </div>
        <Link href="/settings/general/email-notifications" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]">Manage Email Delivery</Link>
      </div>
    </section>
  );
}
