import Link from "next/link";
import PortalEmptyState from "@/components/portal/PortalEmptyState";
import PortalPageHeader from "@/components/portal/PortalPageHeader";
import { getDealerDocuments } from "@/lib/portal/dealer";

function formatBytes(value: number | null) {
  if (!value || value <= 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DealerDocumentsPage() {
  const documents = await getDealerDocuments();

  return (
    <div>
      <PortalPageHeader
        eyebrow="Dealer Portal"
        title="Documents"
        description="Download documents Oakwell has explicitly shared with your Dealer account."
      />

      {!documents.length ? (
        <PortalEmptyState
          title="No shared documents"
          description="Documents shared with your Dealer account will appear here."
        />
      ) : (
        <div className="portal-document-list">
          {documents.map((document) => (
            <article className="portal-panel portal-document-card" key={document.id}>
              <div>
                <p className="portal-kicker">{document.document_type || "Document"}</p>
                <h2>{document.file_name}</h2>
                {document.description ? <p className="portal-muted">{document.description}</p> : null}
                <div className="portal-document-meta">
                  <span>{formatBytes(document.file_size_bytes)}</span>
                  <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(document.created_at))}</span>
                </div>
              </div>
              <Link className="portal-button portal-button--secondary" href={`/dealer/documents/${document.id}/download`}>
                Download
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
