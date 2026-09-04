import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProjectParticipantRoleManager from "@/components/customers/project-detail/ProjectParticipantRoleManager";

export const metadata: Metadata = {
  title: "Project Participant Roles | Modulex Admin",
  description: "Manage reusable Project participant roles",
};

export default function ProjectParticipantRolesSettingsPage() {
  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Project Participant Roles" />
      <ProjectParticipantRoleManager />
    </div>
  );
}
