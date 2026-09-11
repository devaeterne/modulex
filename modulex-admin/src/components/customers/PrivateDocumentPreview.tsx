"use client";

import Button from "@/components/ui/button/Button";
import FormHint from "@/components/form/FormHint";

type Props = {
  fileName: string;
  mimeType?: string | null;
  signedUrl: string;
  onClose: () => void;
  onDownload: () => void;
};

const browserPreviewMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/csv",
]);

export default function PrivateDocumentPreview({ fileName, mimeType, signedUrl, onClose, onDownload }: Props) {
  const normalizedMime = (mimeType || "").trim().toLowerCase();
  const canPreviewInline = browserPreviewMimeTypes.has(normalizedMime);
  const titleId = "private-document-preview-title";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-gray-900 dark:text-white">{fileName}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Private preview · signed access expires automatically</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onDownload}>Download</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}>Open in new tab</Button>
            <Button type="button" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-50 p-3 dark:bg-gray-950">
          {canPreviewInline ? (
            <iframe
              src={signedUrl}
              title={`Preview ${fileName}`}
              className="h-[72vh] min-h-[420px] w-full rounded-lg border border-gray-200 bg-white dark:border-gray-800"
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center p-8 text-center">
              <div className="max-w-xl space-y-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Browser preview is not available for this file type.</p>
                <FormHint>Use Download or Open in new tab. The file remains private and is accessed only through a short-lived signed URL.</FormHint>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
