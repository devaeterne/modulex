"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";

type QRPreviewProps = {
  value: string;
  code?: string;
  size?: number;
  showCode?: boolean;
  className?: string;
};

export default function QRPreview({
  value,
  code,
  size = 84,
  showCode = false,
  className = "",
}: QRPreviewProps) {
  if (!value) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.02] ${className}`}
        style={{
          width: size,
          height: size,
        }}
      >
        No QR
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700">
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          includeMargin={false}
        />
      </div>

      {showCode && code && (
        <p className="mt-2 max-w-[180px] break-all text-center font-mono text-[10px] font-medium text-gray-600 dark:text-gray-400">
          {code}
        </p>
      )}
    </div>
  );
}