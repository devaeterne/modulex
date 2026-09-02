export type CommercialDocumentKind = "order" | "invoice";

export type CommercialDocumentMeta = {
  label: string;
  value: string;
};

export type CommercialDocumentParty = {
  title: string;
  lines: string[];
};

export type CommercialDocumentLine = {
  lineNo: string;
  sku: string;
  description: string;
  detail?: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  total: string;
};

export type CommercialDocumentTotal = {
  label: string;
  value: string;
  strong?: boolean;
};

export type CommercialDocument = {
  kind: CommercialDocumentKind;
  title: string;
  number: string;
  fileName: string;
  meta: CommercialDocumentMeta[];
  billTo: CommercialDocumentParty;
  shipTo?: CommercialDocumentParty | null;
  information?: CommercialDocumentMeta[];
  lines: CommercialDocumentLine[];
  totals: CommercialDocumentTotal[];
  notes?: string | null;
  footerNote?: string | null;
  signatureLabels?: [string, string] | null;
};
