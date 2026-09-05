import type { ReactNode } from "react";
import styles from "./AdminFullCalendar.module.css";

export default function AdminFullCalendarSurface({ children }: { children: ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
