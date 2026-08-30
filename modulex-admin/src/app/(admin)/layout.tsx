"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import EmailNotificationPump from "@/components/email/EmailNotificationPump";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile, type UserRole } from "@/lib/supabase/profile";
import { canAccessPath, hasPermission, ROLE_LABELS } from "@/lib/auth/permissions";
import {
  MODULEX_AUTH_CHANNEL,
  MODULEX_SIGNED_OUT_EVENT,
} from "@/lib/supabase/auth";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);

  useEffect(() => {
    let mounted = true;

    const redirectToSignIn = () => {
      if (typeof window !== "undefined") {
        window.location.replace("/signin");
      } else {
        router.replace("/signin");
      }
    };

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        redirectToSignIn();
        return;
      }

      const { profile, error } = await getCurrentProfile();

      if (error || !profile || !profile.is_active) {
        await supabase.auth.signOut({ scope: "global" });

        if (typeof window !== "undefined") {
          window.location.replace("/signin?reason=inactive");
        } else {
          router.replace("/signin?reason=inactive");
        }
        return;
      }

      if (mounted) {
        setRoles(profile.roles);
        setIsCheckingAuth(false);
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        redirectToSignIn();
      }
    });

    const handleLocalSignedOut = () => redirectToSignIn();
    window.addEventListener(MODULEX_SIGNED_OUT_EVENT, handleLocalSignedOut);

    let authChannel: BroadcastChannel | null = null;

    if ("BroadcastChannel" in window) {
      authChannel = new BroadcastChannel(MODULEX_AUTH_CHANNEL);
      authChannel.onmessage = (event) => {
        if (event.data?.type === "SIGNED_OUT") redirectToSignIn();
      };
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener(MODULEX_SIGNED_OUT_EVENT, handleLocalSignedOut);
      authChannel?.close();
    };
  }, [router]);

  const hasDashboardAccess = hasPermission(roles, "dashboard.view");
  const hasPersonnelAccess = hasPermission(roles, "personnel.view");
  const shouldRedirectFromDashboard =
    roles.length > 0 && pathname === "/" && !hasDashboardAccess && hasPersonnelAccess;

  useEffect(() => {
    if (shouldRedirectFromDashboard) {
      router.replace("/personnel");
    }
  }, [router, shouldRedirectFromDashboard]);

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";

  if (isCheckingAuth || roles.length === 0 || shouldRedirectFromDashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {shouldRedirectFromDashboard ? "Opening Personnel..." : "Checking session..."}
          </p>
        </div>
      </div>
    );
  }

  const allowed = canAccessPath(roles, pathname);
  const isHrOnly = roles.length === 1 && roles[0] === "hr";

  return (
    <div className="min-h-screen xl:flex print:block print:min-h-0">
      {!isHrOnly && <EmailNotificationPump />}
      <div className="print:hidden">
        <AppSidebar roles={roles} />
        <Backdrop />
      </div>

      <div className={`min-w-0 flex-1 transition-all duration-300 ease-in-out print:ml-0 ${mainContentMargin}`}>
        <div className="print:hidden">
          <AppHeader />
        </div>

        <div className="w-full p-4 md:p-6 print:p-0">
          {allowed ? children : <AccessDenied roles={roles} />}
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ roles }: { roles: UserRole[] }) {
  const hasDashboardAccess = hasPermission(roles, "dashboard.view");
  const hasPersonnelAccess = hasPermission(roles, "personnel.view");
  const homeHref = hasDashboardAccess ? "/" : hasPersonnelAccess ? "/personnel" : "/profile";
  const homeLabel = hasDashboardAccess
    ? "Back to Dashboard"
    : hasPersonnelAccess
      ? "Back to Personnel"
      : "Back to Profile";
  const roleLabels = roles.map((role) => ROLE_LABELS[role]).join(" + ");

  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-error-200 bg-white p-8 text-center shadow-theme-xs dark:border-error-500/30 dark:bg-white/[0.03]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-50 text-lg font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400">!</div>
      <h1 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">Access restricted</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-500 dark:text-gray-400">
        Your {roleLabels} role set does not have permission to open this page. Page access and database permissions are enforced independently.
      </p>
      <Link href={homeHref} className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
        {homeLabel}
      </Link>
    </div>
  );
}
