"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import CountertopConfigurator from "@/components/countertop/CountertopConfigurator";
import Button from "@/components/ui/button/Button";

export default function AddCountertopToOrder() {
  const params = useParams<{ orderId: string }>();
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      {!open ? (
        <Button onClick={() => setOpen(true)}>Add Countertop</Button>
      ) : (
        <CountertopConfigurator
          orderId={params.orderId}
          onClose={() => setOpen(false)}
          onAttached={() => window.location.reload()}
        />
      )}
    </div>
  );
}
