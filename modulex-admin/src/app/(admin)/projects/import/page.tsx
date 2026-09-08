import type { Metadata } from "next";
import Link from "next/link";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProjectHistoricalImportManager from "@/components/projects/ProjectHistoricalImportManager";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";

export const metadata: Metadata = {
  title: "Historical Project Import | Modulex Admin",
  description: "Review and import historical customer Projects from Excel",
};

export default function ProjectHistoricalImportPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Historical Project Import" />
      <div className="mb-5">
        <Link href="/projects" className={ADMIN_TEXT_STYLES.muted}>
          ← Back to Projects
        </Link>
      </div>
      <ProjectHistoricalImportManager />
    </div>
  );
}
