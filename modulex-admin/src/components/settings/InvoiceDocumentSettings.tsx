"use client";

import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default function InvoiceDocumentSettings() {
  const [title, setTitle] = useState("Invoice");
  const [footer, setFooter] = useState("");
  const [prefix, setPrefix] = useState("INV-");
  const [padding, setPadding] = useState("6");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const [{ profile, error: profileError }, settingsResult] = await Promise.all([
        getCurrentProfile(),
        supabase
          .from("general_settings")
          .select("invoice_document_title,invoice_footer_note,invoice_number_prefix,invoice_number_padding")
          .eq("id", 1)
          .single(),
      ]);

      if (profileError || settingsResult.error) {
        setMessage({ variant: "error", text: profileError?.message || settingsResult.error?.message || "Invoice document settings could not be loaded." });
        setLoading(false);
        return;
      }

      setCanEdit(["super_admin", "admin"].includes(profile?.role ?? ""));
      setTitle(settingsResult.data.invoice_document_title);
      setFooter(settingsResult.data.invoice_footer_note || "");
      setPrefix(settingsResult.data.invoice_number_prefix);
      setPadding(String(settingsResult.data.invoice_number_padding));
      setLoading(false);
    }

    void load();
  }, []);

  async function save() {
    const normalizedTitle = title.trim();
    const normalizedPrefix = prefix.trim().toUpperCase();
    const normalizedPadding = Number.parseInt(padding, 10);

    if (!normalizedTitle) {
      setMessage({ variant: "error", text: "Invoice document title is required." });
      return;
    }
    if (!normalizedPrefix || normalizedPrefix.length > 12) {
      setMessage({ variant: "error", text: "Invoice Number Prefix must be 1-12 characters." });
      return;
    }
    if (!Number.isInteger(normalizedPadding) || normalizedPadding < 1 || normalizedPadding > 12) {
      setMessage({ variant: "error", text: "Invoice Number Padding must be between 1 and 12." });
      return;
    }

    setSaving(true);
    setMessage(null);
    const { error: saveError } = await supabase
      .from("general_settings")
      .update({
        invoice_document_title: normalizedTitle,
        invoice_footer_note: footer.trim() || null,
        invoice_number_prefix: normalizedPrefix,
        invoice_number_padding: normalizedPadding,
      })
      .eq("id", 1);
    setSaving(false);

    if (saveError) {
      setMessage({ variant: "error", text: saveError.message });
      return;
    }

    setPrefix(normalizedPrefix);
    setPadding(String(normalizedPadding));
    setMessage({ variant: "success", text: "Invoice document settings saved." });
  }

  if (loading) return <Alert variant="info" title="Loading Invoice defaults" message="Invoice document settings are being loaded." />;

  const disabled = !canEdit || saving;

  return (
    <ComponentCard
      title="Invoice Document Defaults"
      desc="Company-wide wording and generated Invoice number format. Padding is a minimum width and never truncates sequence digits."
      headerAction={canEdit ? <Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Invoice Defaults"}</Button> : undefined}
    >
      <div className="space-y-4">
        {message ? <Alert variant={message.variant} title={message.variant === "success" ? "Saved" : "Invoice document settings"} message={message.text} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="invoice-document-title">Invoice Document Title *</Label>
            <Input id="invoice-document-title" value={title} onChange={(event) => { setTitle(event.target.value); setMessage(null); }} disabled={disabled} required />
          </div>
          <div>
            <Label htmlFor="invoice-number-prefix">Invoice Number Prefix</Label>
            <Input id="invoice-number-prefix" value={prefix} onChange={(event) => { setPrefix(event.target.value); setMessage(null); }} disabled={disabled} maxLength={12} />
          </div>
          <div>
            <Label htmlFor="invoice-number-padding">Invoice Number Padding</Label>
            <Input id="invoice-number-padding" value={padding} onChange={(event) => { setPadding(event.target.value.replace(/\D/g, "")); setMessage(null); }} disabled={disabled} inputMode="numeric" maxLength={2} hint="Minimum generated-number width, from 1 to 12 digits." />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="invoice-footer-note">Invoice Footer Note</Label>
            <TextArea id="invoice-footer-note" value={footer} onChange={(value) => { setFooter(value); setMessage(null); }} disabled={disabled} rows={4} placeholder="Optional footer shown on Invoice documents." />
          </div>
        </div>
      </div>
    </ComponentCard>
  );
}
