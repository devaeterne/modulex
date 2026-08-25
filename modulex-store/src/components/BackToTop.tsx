"use client";

import { useEffect, useState } from "react";
import { useScrollStore } from "@/store/useScrollStore";

export default function BackToTop() {
  const scroll = useScrollStore((state) => state.scroll);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!scroll) return;

    const handleScroll = ({ scroll: s }: any) => {
      setIsVisible(s.y > 300);
    };

    scroll.on("scroll", handleScroll);
    
    return () => {
      // Cleanup if needed
    };
  }, [scroll]);

  const scrollToTop = (e: React.MouseEvent) => {
    e.preventDefault();
    if (scroll) {
      scroll.scrollTo(0, {
        duration: 1000,
        easing: [0.25, 0.0, 0.35, 1.0],
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <a 
      id="backToTop" 
      className={`back-to-top ${isVisible ? "show" : ""}`}
      onClick={scrollToTop}
      href="#"
    >
      <i className="bi bi-arrow-up"></i>
    </a>
  );
}
