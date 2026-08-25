"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useScrollStore } from "@/store/useScrollStore";
import { usePathname, useSearchParams } from "next/navigation";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function SmoothScroll() {
  const setScroll = useScrollStore((state) => state.setScroll);
  const scroll = useScrollStore((state) => state.scroll);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const containerRef = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!scroll) return;

    scroll.scrollTo(0, { duration: 0, disableLerp: true });
    scroll.update();

    const t1 = setTimeout(() => scroll.update(), 500);
    const t2 = setTimeout(() => scroll.update(), 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, searchParams, scroll]);

  useEffect(() => {
    let scrollInstance: any = null;
    let isMounted = true;

    containerRef.current =
      document.querySelector("[data-scroll-container]") || null;

    if (!containerRef.current) return;

    import("locomotive-scroll").then((module) => {
      if (!isMounted || !containerRef.current) return;

      const LocomotiveScroll = module.default;

      scrollInstance = new LocomotiveScroll({
        el: containerRef.current,
        smooth: true,
        multiplier: 1,
        class: "is-reveal",
      });

      setScroll(scrollInstance);
    });

    return () => {
      isMounted = false;

      if (scrollInstance) {
        scrollInstance.destroy();
      }

      setScroll(null);
    };
  }, [setScroll]);

  
  useEffect(() => {
    if (!scroll || !containerRef.current) return;

    const container = containerRef.current;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("#") || href === "#") return;

      const targetEl = container.querySelector(href) as HTMLElement;

      if (targetEl) {
        e.preventDefault();
        scroll.scrollTo(targetEl);
      }
    };

    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
    };
  }, [scroll]);

  return null;
}