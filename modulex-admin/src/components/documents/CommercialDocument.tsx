"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_DOCUMENT_STYLES } from "@/components/ui/theme/adminTheme";
import type { GeneralSettings } from "@/lib/settings/types";
import type { CommercialDocument as CommercialDocumentModel, CommercialDocumentParty } from "@/lib/documents/types";
import { downloadCommercialDocumentPdf } from "@/lib/documents/pdf";

type Props = {
  document: CommercialDocumentModel;
  settings: GeneralSettings;
};

function companyAddress(settings: GeneralSettings) {
  return [
    settings.legal_name || settings.company_name,
    settings.address_line_1,
    settings.address_line_2,
    [settings.city, settings.state_region, settings.postal_code].filter(Boolean).join(", "),
    settings.country_code,
    settings.phone ? `P ${settings.phone}` : null,
    settings.email,
    settings.website,
  ].filter((value): value is string => Boolean(value && value.trim()));
}

function PartyBlock({ party }: { party: CommercialDocumentParty }) {
  return (
    <div className="min-w-0">
      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${ADMIN_DOCUMENT_STYLES.kicker}`}>{party.title}</p>
      <div className={`mt-2 space-y-0.5 text-xs leading-5 ${ADMIN_DOCUMENT_STYLES.partyText}`}>
        {party.lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
      </div>
    </div>
  );
}

export default function CommercialDocument({ document, settings }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const primaryLogo = settings.primary_logo_on_light_url || settings.logo_url;
  const secondaryLogo = settings.secondary_logo_on_light_url;
  const addressLines = companyAddress(settings);

  async function downloadPdf() {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadCommercialDocumentPdf(document, settings);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "PDF could not be generated.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className={`min-h-screen px-3 py-6 sm:px-6 print:min-h-0 print:p-0 ${ADMIN_DOCUMENT_STYLES.viewer}`}>
      <style jsx global>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .commercial-document-sheet { width: 210mm !important; min-height: 297mm !important; margin: 0 !important; box-shadow: none !important; }
          .commercial-document-table thead { display: table-header-group; }
          .commercial-document-table tr, .commercial-document-totals, .commercial-document-signatures { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className={`mx-auto mb-4 flex w-full max-w-[210mm] flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between print:hidden ${ADMIN_DOCUMENT_STYLES.toolbar}`}>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${ADMIN_DOCUMENT_STYLES.toolbarTitle}`}>{document.title} · {document.number}</p>
          <p className={`mt-0.5 text-xs ${ADMIN_DOCUMENT_STYLES.toolbarMuted}`}>A4 preview. Print output and downloaded PDF use the light-background brand assets.</p>
          {downloadError ? <p className={`mt-1 text-xs ${ADMIN_DOCUMENT_STYLES.toolbarError}`}>{downloadError}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
          <Button size="sm" onClick={() => void downloadPdf()} disabled={isDownloading}>{isDownloading ? "Preparing PDF..." : "Download PDF"}</Button>
        </div>
      </div>

      <article className={`commercial-document-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] px-[12mm] py-[11mm] ${ADMIN_DOCUMENT_STYLES.sheet}`}>
        <header className={`grid grid-cols-1 gap-6 border-b pb-6 sm:grid-cols-[1.05fr_0.9fr_0.9fr] sm:items-center ${ADMIN_DOCUMENT_STYLES.borderStrong}`}>
          <div className={`text-xs leading-[1.55] ${ADMIN_DOCUMENT_STYLES.companyText}`}>
            {addressLines.map((line, index) => <p key={`${line}-${index}`} className={index === 0 ? `font-semibold ${ADMIN_DOCUMENT_STYLES.companyStrong}` : ""}>{line}</p>)}
          </div>
          <div className="flex min-h-16 items-center justify-start sm:justify-center">
            {primaryLogo ? <img src={primaryLogo} alt={`${settings.company_name} primary logo`} className="max-h-16 max-w-[180px] object-contain" /> : <span className={`text-lg font-semibold tracking-tight ${ADMIN_DOCUMENT_STYLES.logoFallback}`}>{settings.company_name}</span>}
          </div>
          <div className="commercial-document-secondary-logo flex h-20 items-center justify-start overflow-hidden sm:justify-end">
            {secondaryLogo ? <img src={secondaryLogo} alt="Secondary brand logo" className="max-h-20 max-w-[150px] origin-center scale-[1.12] object-contain" /> : null}
          </div>
        </header>

        <section className={`grid gap-6 border-b py-6 sm:grid-cols-[1fr_auto] sm:items-start ${ADMIN_DOCUMENT_STYLES.borderSoft}`}>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${ADMIN_DOCUMENT_STYLES.kicker}`}>{document.kind}</p>
            <h1 className={`mt-1 text-2xl font-semibold tracking-tight ${ADMIN_DOCUMENT_STYLES.title}`}>{document.title}</h1>
          </div>
          <div className="min-w-[220px] sm:text-right">
            <p className={`text-xl font-bold tracking-tight ${ADMIN_DOCUMENT_STYLES.title}`}>{document.number}</p>
            <div className={`mt-2 space-y-1 text-xs ${ADMIN_DOCUMENT_STYLES.meta}`}>
              {document.meta.map((entry) => <p key={entry.label}><span className={`font-medium ${ADMIN_DOCUMENT_STYLES.metaLabel}`}>{entry.label}:</span> {entry.value}</p>)}
            </div>
          </div>
        </section>

        <section className={`grid gap-8 border-b py-6 ${ADMIN_DOCUMENT_STYLES.borderSoft} ${document.shipTo ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <PartyBlock party={document.billTo} />
          {document.shipTo ? <PartyBlock party={document.shipTo} /> : null}
          <div className={document.shipTo ? "" : "sm:text-right"}>
            <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${ADMIN_DOCUMENT_STYLES.kicker}`}>Document Information</p>
            <div className={`mt-2 space-y-1 text-xs leading-5 ${ADMIN_DOCUMENT_STYLES.partyText}`}>
              {(document.information ?? []).map((entry) => <p key={entry.label}><span className={`font-medium ${ADMIN_DOCUMENT_STYLES.infoStrong}`}>{entry.label}:</span> {entry.value}</p>)}
            </div>
          </div>
        </section>

        <div className="mt-6 overflow-x-auto print:overflow-visible">
          <Table variant="plain" className="commercial-document-table w-full text-left text-xs">
            <TableHeader variant="plain">
              <TableRow className={`border-y uppercase tracking-wide ${ADMIN_DOCUMENT_STYLES.tableHead}`}>
                <TableCell isHeader variant="plain" className="w-8 py-2.5 pr-2 text-xs font-semibold">#</TableCell>
                <TableCell isHeader variant="plain" className="w-24 py-2.5 pr-2 text-xs font-semibold">SKU</TableCell>
                <TableCell isHeader variant="plain" className="py-2.5 pr-2 text-xs font-semibold">Product / Description</TableCell>
                <TableCell isHeader variant="plain" className="w-12 py-2.5 pr-2 text-right text-xs font-semibold">Qty</TableCell>
                <TableCell isHeader variant="plain" className="w-24 py-2.5 pr-2 text-right text-xs font-semibold">Unit Price</TableCell>
                <TableCell isHeader variant="plain" className="w-20 py-2.5 pr-2 text-right text-xs font-semibold">Discount</TableCell>
                <TableCell isHeader variant="plain" className="w-24 py-2.5 text-right text-xs font-semibold">Total</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody variant="plain">
              {document.lines.map((item) => (
                <TableRow key={`${item.lineNo}-${item.sku}`} className={`border-b align-top ${ADMIN_DOCUMENT_STYLES.tableRow}`}>
                  <TableCell variant="plain" className={`py-3 pr-2 ${ADMIN_DOCUMENT_STYLES.lineNo}`}>{item.lineNo}</TableCell>
                  <TableCell variant="plain" className={`py-3 pr-2 font-medium ${ADMIN_DOCUMENT_STYLES.sku}`}>{item.sku}</TableCell>
                  <TableCell variant="plain" className={`py-3 pr-2 ${ADMIN_DOCUMENT_STYLES.description}`}><p>{item.description}</p>{item.detail ? <p className={`mt-1 whitespace-pre-line text-xs leading-4 ${ADMIN_DOCUMENT_STYLES.detail}`}>{item.detail}</p> : null}</TableCell>
                  <TableCell variant="plain" className={`py-3 pr-2 text-right ${ADMIN_DOCUMENT_STYLES.numeric}`}>{item.quantity}</TableCell>
                  <TableCell variant="plain" className={`py-3 pr-2 text-right ${ADMIN_DOCUMENT_STYLES.numeric}`}>{item.unitPrice}</TableCell>
                  <TableCell variant="plain" className={`py-3 pr-2 text-right ${ADMIN_DOCUMENT_STYLES.numeric}`}>{item.discount}</TableCell>
                  <TableCell variant="plain" className={`py-3 text-right font-semibold ${ADMIN_DOCUMENT_STYLES.lineTotal}`}>{item.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <section className="commercial-document-totals ml-auto mt-6 w-full max-w-[330px] text-xs">
          {document.totals.map((total, index) => {
            const totalClass = total.strong
              ? `mt-2 flex items-center justify-between gap-6 border-t-2 pt-3 text-sm font-bold ${ADMIN_DOCUMENT_STYLES.totalsStrong}`
              : `flex items-center justify-between gap-6 py-1 ${ADMIN_DOCUMENT_STYLES.totalsRegular}`;
            return (
              <div key={`${total.label}-${index}`} className={totalClass}>
                <span>{total.label}</span><span className={total.strong ? "" : `font-medium ${ADMIN_DOCUMENT_STYLES.totalsValue}`}>{total.value}</span>
              </div>
            );
          })}
        </section>

        {document.notes ? <section className={`mt-8 border-t pt-5 ${ADMIN_DOCUMENT_STYLES.borderSoft}`}><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${ADMIN_DOCUMENT_STYLES.kicker}`}>Notes</p><p className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${ADMIN_DOCUMENT_STYLES.noteText}`}>{document.notes}</p></section> : null}
        {document.footerNote ? <footer className={`mt-8 border-t pt-4 text-xs leading-4 ${ADMIN_DOCUMENT_STYLES.borderSoft} ${ADMIN_DOCUMENT_STYLES.footerText}`}><p className="whitespace-pre-wrap">{document.footerNote}</p></footer> : null}

        {document.signatureLabels ? <section className={`commercial-document-signatures mt-14 grid grid-cols-2 gap-12 pt-8 text-center text-xs ${ADMIN_DOCUMENT_STYLES.signatureText}`}><div className={`border-t pt-2 ${ADMIN_DOCUMENT_STYLES.signatureBorder}`}>{document.signatureLabels[0]}</div><div className={`border-t pt-2 ${ADMIN_DOCUMENT_STYLES.signatureBorder}`}>{document.signatureLabels[1]}</div></section> : null}
      </article>
    </main>
  );
}
