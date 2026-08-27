import Link from "next/link";

export default function SidebarWidget() {
  return (
    <div className="mx-auto mb-10 w-full max-w-60 rounded-2xl bg-gray-50 px-4 py-5 text-center dark:bg-white/[0.03]">
      <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
        Oakwell Cabinetry Admin
      </h3>

      <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">
        Need help with a workflow? Open the role-based training center for step-by-step operating guides.
      </p>

      <Link
        href="/training"
        className="flex items-center justify-center rounded-lg bg-brand-500 p-3 text-theme-sm font-medium text-white hover:bg-brand-600"
      >
        Help & Training
      </Link>
    </div>
  );
}
