import CorporateProfile from "@/components/user-profile/CorporateProfile";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile | Modulex Admin",
  description: "Manage personal account information and review assigned access.",
};

export default function ProfilePage() {
  return <CorporateProfile />;
}
