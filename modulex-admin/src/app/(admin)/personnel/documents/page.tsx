import type { Metadata } from "next";
import DocumentsManager from "@/components/hr/DocumentsManager";

export const metadata: Metadata = {
  title: "Employee Documents | Modulex Admin",
  description: "Secure personnel document management",
};

export default function DocumentsPage() {
  return <DocumentsManager />;
}
