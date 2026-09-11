"use client";

import FormHint from "@/components/form/FormHint";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { ADMIN_DOCUMENT_STYLES, ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";

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
    <Modal
      isOpen
      onClose={onClose}
      showCloseButton={false}
      backdropCloseEvent="mouseDown"
      ariaLabelledBy={titleId}
      className="max-h-[92vh] max-w-6xl overflow-hidden"
    >
      <div className="flex max-h-[92vh] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className={`truncate text-base font-semibold ${ADMIN_TEXT_STYLES.strong}`}>
              {fileName}
            </h2>
            <p className={`mt-1 text-xs ${ADMIN_TEXT_STYLES.muted}`}>
              Private preview · signed access expires automatically
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onDownload}>Download</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}
            >
              Open in new tab
            </Button>
            <Button type="button" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-auto p-3 ${ADMIN_DOCUMENT_STYLES.viewer}`}>
          {canPreviewInline ? (
            <iframe
              src={signedUrl}
              title={`Preview ${fileName}`}
              className="h-[72vh] min-h-[420px] w-full"
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center p-8 text-center">
              <div className="max-w-xl space-y-3">
                <p className={`text-sm font-medium ${ADMIN_TEXT_STYLES.strong}`}>
                  Browser preview is not available for this file type.
                </p>
                <FormHint>
                  Use Download or Open in new tab. The file remains private and is accessed only through a short-lived signed URL.
                </FormHint>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
