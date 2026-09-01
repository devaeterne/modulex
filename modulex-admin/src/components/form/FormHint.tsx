import type { ReactNode } from "react";

type FormHintProps = {
  children: ReactNode;
};

export default function FormHint({ children }: FormHintProps) {
  return (
    <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
      {children}
    </p>
  );
}
