"use client";

import { useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import SinkVendorImportsPanel from "./SinkVendorImportsPanel";
import StoneContentBackfill from "./StoneContentBackfill";
import StoneVendorImportsPanel from "./StoneVendorImportsPanel";

export type CatalogDomain = "sink" | "stone";

export default function VendorImportsPage() {
  const [catalogDomain, setCatalogDomain] = useState<CatalogDomain>("sink");

  return (
    <div className="space-y-6">
      {catalogDomain === "stone" ? <PageBreadcrumb pageTitle="Vendor Import Review · Stone" /> : null}

      <div className="flex flex-wrap gap-2" aria-label="Vendor catalog domain">
        <Button
          size="sm"
          variant={catalogDomain === "sink" ? "primary" : "outline"}
          aria-pressed={catalogDomain === "sink"}
          onClick={() => setCatalogDomain("sink")}
        >Sink</Button>
        <Button
          size="sm"
          variant={catalogDomain === "stone" ? "primary" : "outline"}
          aria-pressed={catalogDomain === "stone"}
          onClick={() => setCatalogDomain("stone")}
        >Stone</Button>
      </div>

      {catalogDomain === "sink" ? (
        <SinkVendorImportsPanel />
      ) : (
        <>
          <StoneContentBackfill />
          <StoneVendorImportsPanel />
        </>
      )}
    </div>
  );
}
