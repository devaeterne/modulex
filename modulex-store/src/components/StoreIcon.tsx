export type StoreIconName =
  | "arrow-up"
  | "bounding-box"
  | "building"
  | "chat"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "envelope"
  | "facebook"
  | "geo-alt"
  | "grid"
  | "house"
  | "instagram"
  | "linkedin"
  | "moon"
  | "palette"
  | "pinterest"
  | "star"
  | "sun"
  | "telephone"
  | "tiktok"
  | "twitter-x"
  | "x"
  | "youtube";

type StoreIconProps = {
  name: StoreIconName;
  className?: string;
  size?: number | string;
};

const brandLabels: Partial<Record<StoreIconName, string>> = {
  facebook: "f",
  instagram: "IG",
  linkedin: "in",
  pinterest: "P",
  tiktok: "Tk",
  "twitter-x": "X",
  youtube: "▶",
};

export default function StoreIcon({ name, className, size = "1em" }: StoreIconProps) {
  const brand = brandLabels[name];
  if (brand) {
    return (
      <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <text x="12" y="14.7" fill="currentColor" fontFamily="system-ui, sans-serif" fontSize={brand.length > 1 ? "7" : "10"} fontWeight="800" textAnchor="middle">
          {brand}
        </text>
      </svg>
    );
  }

  switch (name) {
    case "grid":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
    case "chevron-left":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>;
    case "chevron-right":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;
    case "arrow-up":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 10 6-6 6 6" /><path d="M12 4v16" /></svg>;
    case "x":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case "sun":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>;
    case "moon":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" /></svg>;
    case "star":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.15 6.37 20.1l1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z" /></svg>;
    case "geo-alt":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.3" /></svg>;
    case "envelope":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case "telephone":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.2 3.5 10 7.8 8.1 10c1.4 2.8 3.1 4.5 5.9 5.9l2.2-1.9 4.3 2.8c.2.1.3.4.3.6-.4 2.1-2.2 3.6-4.3 3.6C9 21 3 15 3 7.5c0-2.1 1.5-3.9 3.6-4.3.2 0 .5.1.6.3Z" /></svg>;
    case "clock":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "chat":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4.5A2 2 0 0 1 3 15V6a2 2 0 0 1 2-2Z" /><path d="M7 8h10M7 12h7" /></svg>;
    case "building":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M5 21V4h10v17M15 9h4v12M3 21h18" /><path d="M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1" /></svg>;
    case "house":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m3 11 9-8 9 8v10H3V11Z" /><path d="M9 21v-7h6v7" /></svg>;
    case "bounding-box":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" /><circle cx="5" cy="5" r="2" fill="currentColor" /><circle cx="19" cy="5" r="2" fill="currentColor" /><circle cx="5" cy="19" r="2" fill="currentColor" /><circle cx="19" cy="19" r="2" fill="currentColor" /></svg>;
    case "palette":
      return <svg aria-hidden="true" className={className} focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z" /><circle cx="7.5" cy="9" r="1" fill="currentColor" /><circle cx="10" cy="6.5" r="1" fill="currentColor" /><circle cx="15" cy="7" r="1" fill="currentColor" /></svg>;
  }
}
