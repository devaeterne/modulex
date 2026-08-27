import type { Metadata } from "next";
import AttendanceManager from "@/components/hr/AttendanceManager";

export const metadata: Metadata = {
  title: "Attendance | Modulex Admin",
  description: "Personnel attendance and absence management",
};

export default function AttendancePage() {
  return <AttendanceManager />;
}
