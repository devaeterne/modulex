"use client";

import { useState } from "react";
import Button from "@/components/ui/button/Button";
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{party.title}</p>
      <div className="mt-2 space-y-0.5 text-[12px] leading-5 text-gray-700">
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
    <main className="min-h-screen bg-gray-100 px-3 py-6 transition-colors dark:bg-gray-950 sm:px-6 print:min-h-0 print:bg-white print:p-0">
      <style jsx global>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .commercial-document-sheet { width: 210mm !important; min-height: 297mm !important; margin: 0 !important; box-shadow: none !important; }
          .commercial-document-table thead { display: table-header-group; }
          .commercial-document-table tr, .commercial-document-totals, .commercial-document-signatures { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto mb-4 flex w-full max-w-[210mm] flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{document.title} · {document.number}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">A4 preview. Print output and downloaded PDF use the light-background brand assets.</p>
          {downloadError ? <p className="mt-1 text-xs text-error-600 dark:text-error-400">{downloadError}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
          <Button size="sm" onClick={() => void downloadPdf()} disabled={isDownloading}>{isDownloading ? "Preparing PDF..." : "Download PDF"}</Button>
        </div>
      </div>

      <article className="commercial-document-sheet mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[12mm] py-[11mm] text-gray-900 shadow-xl shadow-gray-900/10 ring-1 ring-gray-200 dark:bg-white dark:text-gray-900 dark:ring-gray-700 print:ring-0">
        <header className="grid grid-cols-1 gap-6 border-b border-gray-300 pb-6 sm:grid-cols-[1.05fr_0.9fr_0.9fr] sm:items-center">
          <div className="text-[11px] leading-[1.55] text-gray-700">
            {addressLines.map((line, index) => <p key={`${line}-${index}`} className={index === 0 ? "font-semibold text-gray-900" : ""}>{line}</p>)}
          </div>
          <div className="flex min-h-16 items-center justify-start sm:justify-center">
            {primaryLogo ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={primaryLogo} alt={`${settings.company_name} primary logo`} className="max-h-16 max-w-[180px] object-contain" /></> : <span className="text-lg font-semibold tracking-tight text-gray-800">{settings.company_name}</span>}
          </div>
          <div className="flex min-h-16 items-center justify-start sm:justify-end">
            {secondaryLogo ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={secondaryLogo} alt="Secondary brand logo" className="max-h-16 max-w-[180px] object-contain" /></> : null}
          </div>
        </header>

        <section className="grid gap-6 border-b border-gray-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{document.kind}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">{document.title}</h1>
          </div>
          <div className="min-w-[220px] sm:text-right">
            <p className="text-xl font-bold tracking-tight text-gray-950">{document.number}</p>
            <div className="mt-2 space-y-1 text-[11px] text-gray-600">
              {document.meta.map((entry) => <p key={entry.label}><span className="font-medium text-gray-800">{entry.label}:</span> {entry.value}</p>)}
            </div>
          </div>
        </section>

        <section className={`grid gap-8 border-b border-gray-200 py-6 ${document.shipTo ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <PartyBlock party={document.billTo} />
          {document.shipTo ? <PartyBlock party={document.shipTo} /> : null}
          <div className={document.shipTo ? "" : "sm:text-right"}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Document Information</p>
            <div className="mt-2 space-y-1 text-[11px] leading-5 text-gray-700">
              {(document.information ?? []).map((entry) => <p key={entry.label}><span className="font-medium text-gray-900">{entry.label}:</span> {entry.value}</p>)}
            </div>
          </div>
        </section>

        <div className="mt-6 overflow-x-auto print:overflow-visible">
          <table className="commercial-document-table w-full border-collapse text-left text-[10.5px]">
            <thead>
              <tr className="border-y border-gray-300 text-[9px] uppercase tracking-wide text-gray-500">
                <th className="w-8 py-2.5 pr-2 font-semibold">#</th>
                <th className="w-24 py-2.5 pr-2 font-semibold">SKU</th>
                <th className="py-2.5 pr-2 font-semibold">Product / Description</th>
                <th className="w-12 py-2.5 pr-2 text-right font-semibold">Qty</th>
                <th className="w-24 py-2.5 pr-2 text-right font-semibold">Unit Price</th>
                <th className="w-20 py-2.5 pr-2 text-right font-semibold">Discount</th>
                <th className="w-24 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((item) => (
                <tr key={`${item.lineNo}-${item.sku}`} className="border-b border-gray-200 align-top">
                  <td className="py-3 pr-2 text-gray-500">{item.lineNo}</td>
                  <td className="py-3 pr-2 font-medium text-gray-900">{item.sku}</td>
                  <td className="py-3 pr-2 text-gray-800"><p>{item.description}</p>{item.detail ? <p className="mt-1 text-[9px] leading-4 text-gray-500">{item.detail}</p> : null}</td>
                  <td className="py-3 pr-2 text-right text-gray-700">{item.quantity}</td>
                  <td className="py-3 pr-2 text-right text-gray-700">{item.unitPrice}</td>
                  <td className="py-3 pr-2 text-right text-gray-700">{item.discount}</td>
                  <td className="py-3 text-right font-semibold text-gray-950">{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="commercial-document-totals ml-auto mt-6 w-full max-w-[330px] text-[11px]">
          {document.totals.map((total, index) => (
            <div key={`${total.label}-${index}`} className={`flex items-center justify-between gap-6 ${total.strong ? "mt-2 border-t-2 border-gray-900 pt-3 text-sm font-bold text-gray-950" : "py-1 text-gray-700"}`}>
              <span>{total.label}</span><span className={total.strong ? "" : "font-medium text-gray-900"}>{total.value}</span>
            </div>
          ))}
        </section>

        {document.notes ? <section className="mt-8 border-t border-gray-200 pt-5"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">Notes</p><p className="mt-2 whitespace-pre-wrap text-[10.5px] leading-5 text-gray-700">{document.notes}</p></section> : null}
        {document.footerNote ? <footer className="mt-8 border-t border-gray-200 pt-4 text-[9px] leading-4 text-gray-500"><p className="whitespace-pre-wrap">{document.footerNote}</p></footer> : null}

        {document.signatureLabels ? <section className="commercial-document-signatures mt-14 grid grid-cols-2 gap-12 pt-8 text-center text-[10px] text-gray-600"><div className="border-t border-gray-500 pt-2">{document.signatureLabels[0]}</div><div className="border-t border-gray-500 pt-2">{document.signatureLabels[1]}</div></section> : null}
      </article>
    </main>
  );
}
