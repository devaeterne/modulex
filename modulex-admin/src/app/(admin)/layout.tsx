"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
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
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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
        if (event.data?.type === "SIGNED_OUT") {
          redirectToSignIn();
        }
      };
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener(MODULEX_SIGNED_OUT_EVENT, handleLocalSignedOut);
      authChannel?.close();
    };
  }, [router]);

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Checking session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen xl:flex print:block print:min-h-0">
      <div className="print:hidden">
        <AppSidebar />
        <Backdrop />
      </div>

      <div
        className={`flex-1 transition-all duration-300 ease-in-out print:ml-0 ${mainContentMargin}`}
      >
        <div className="print:hidden">
          <AppHeader />
        </div>

        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6 print:max-w-none print:p-0">
          {children}
        </div>
      </div>
    </div>
  );
}
