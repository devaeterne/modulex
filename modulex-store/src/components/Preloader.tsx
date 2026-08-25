"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollStore } from "@/store/useScrollStore";
import { usePathname } from "next/navigation";

export default function Preloader() {
  const scroll = useScrollStore((state) => state.scroll);
  const pathname = usePathname();

  const isFirstLoad = useRef(true);
  const scrollRef = useRef(scroll);

  const [isLoaded, setIsLoaded] = useState(false);

  // sync scroll ref
  useEffect(() => {
    scrollRef.current = scroll;
  }, [scroll]);

  // handle body class (React-friendly)
  useEffect(() => {
    if (isLoaded) {
      document.body.classList.add("loaded");
    } else {
      document.body.classList.remove("loaded");
    }

    return () => {
      document.body.classList.remove("loaded");
    };
  }, [isLoaded]);

  useEffect(() => {
    const hideLoader = () => {
      setIsLoaded(true);

      setTimeout(() => {
        scrollRef.current?.update();
      }, 100);
    };

    if (isFirstLoad.current) {
      const MAX_WAIT = 2500;
      let done = false;

      const initialHide = () => {
        if (done) return;
        done = true;
        hideLoader();
      };

      if (document.readyState === "complete") {
        initialHide();
      } else {
        window.addEventListener("load", initialHide);
      }

      const timer = setTimeout(initialHide, MAX_WAIT);

      isFirstLoad.current = false;

      return () => {
        window.removeEventListener("load", initialHide);
        clearTimeout(timer);
      };
    } else {
      // navigation case
      setIsLoaded(false);

      const timer = setTimeout(hideLoader, 800);

      return () => clearTimeout(timer);
    }
  }, [pathname]);

  return (
    <div id="preloader">
      <div className="preloader-inner">
        <div className="line-loader"></div>
      </div>
    </div>
  );
}