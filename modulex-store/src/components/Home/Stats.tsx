"use client";

import { useEffect, useRef, useState } from "react";

interface StatProps {
  target: number;
  label: string;
  suffix?: string;
  prefix?: string;
}

const StatItem = ({ target, label, suffix = "", prefix = "" }: StatProps) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = 0;
          const end = target;
          const duration = 2000;
          const increment = end / (duration / 16); // 60fps

          const timer = setInterval(() => {
            start += increment;
            if (start >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(Math.ceil(start));
            }
          }, 16);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [target]);

  return (
    <div className="stat-item-enhanced" ref={ref}>
      <div className="stat-number">
        {prefix}
        {count}
      </div>
      {suffix && <div className={suffix === "%" ? "stat-percent" : "stat-plus"}>{suffix}</div>}
      <div className="stat-label">{label}</div>
    </div>
  );
};

export default function Stats() {
  return (
    <section className="stats-enhanced" aria-label="enhanced">
      <div className="stats-overlay"></div>
      <div className="container">
        <div className="stats-grid-enhanced">
          <StatItem target={15} label="Years Experience" suffix="+" />
          <StatItem target={500} label="Happy Clients" suffix="+" />
          <StatItem target={25} label="Design Awards" suffix="+" />
          <StatItem target={98} label="Satisfaction Rate" suffix="%" />
        </div>
      </div>
    </section>
  );
}
