import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectIncludes = (source, snippets, label) => {
  for (const snippet of snippets) {
    expect(source.includes(snippet), `${label} must include: ${snippet}`);
  }
};

const stockForm = read("src/components/stock-operations/StockOperationForm.tsx");
const cameraScanner = read("src/components/scan/CameraScanner.tsx");
const guidedOperation = read("src/components/scan/GuidedStockOperation.tsx");
const scanPanel = read("src/components/scan/ScanPanel.tsx");
const qrLabels = read("src/components/qr-labels/QRLabelsGrid.tsx");
const a22Contract = read("scripts/a2-inventory-movements-contract.mjs");
const acceptancePath = "docs/acceptance/a2-3-stock-operations-scanning.md";

expectIncludes(stockForm, [
  "stock_in_idempotent",
  "stock_out_idempotent",
  "stock_transfer_idempotent",
  "reserve_stock_idempotent",
  "release_stock_idempotent",
  "crypto.randomUUID()",
  "Insufficient available stock",
  "Source and target locations cannot be the same.",
  "isSubmitting",
], "StockOperationForm");

expectIncludes(cameraScanner, [
  "SAME_VALUE_COOLDOWN_MS",
  "lastScanRef.current",
  ".value === value",
  ".timestamp <",
  "processingRef.current",
  "processingRef.current = true",
  "processingRef.current = false",
  "facingMode:",
  '"environment"',
  "navigator.vibrate",
], "CameraScanner");

expectIncludes(guidedOperation, [
  "scanNonce",
  "applyScannedValue(scannedValue)",
  "window.confirm(getConfirmationMessage())",
  "stock_in_idempotent",
  "stock_out_idempotent",
  "stock_transfer_idempotent",
  "reserve_stock_idempotent",
  "release_stock_idempotent",
  "Source and target shelf cannot be the same.",
  "This shelf code exists in more than one location. Scan the full shelf QR.",
  "No active product found for this SKU, barcode, or product QR.",
  "onWorkflowReadyChange?.(workflowReady)",
], "GuidedStockOperation");

expectIncludes(scanPanel, [
  "Manual Input /",
  "Hardware Scanner",
  "Scan with Camera",
  "handleCameraScan",
  "handleManualSubmit",
  "processInput",
  "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6",
  "sm:flex-row",
  "h-11",
], "ScanPanel");

expectIncludes(qrLabels, [
  "QRCodeSVG",
  'type BulkPrintMode =',
  '| "a4"',
  '| "label"',
  "window.print()",
  'kind: "single-label"',
  'kind: "single-a4"',
  '"50x30"',
  '"60x40"',
  '"70x50"',
  "grid grid-cols-1 gap-5 p-5 md:grid-cols-2 xl:grid-cols-4",
  "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3",
], "QRLabelsGrid");

expectIncludes(a22Contract, [
  "stock_in_idempotent",
  "stock_out_idempotent",
  "stock_transfer_idempotent",
  "reserve_stock_idempotent",
  "release_stock_idempotent",
], "A2.2 contract");

expect(exists(acceptancePath), "A2.3 production acceptance artifact must exist");
const acceptance = read(acceptancePath);
expectIncludes(acceptance, [
  "A2.3 production acceptance: PASS",
  "Active zones: 6",
  "Active locations: 2",
  "Active products: 462",
  "Duplicate active barcodes: 0",
  "Invalid inventory quantities: 0",
  "Camera duplicate protection: PASS",
  "Guided write confirmation: PASS",
  "QR label printing: PASS",
  "Mobile warehouse usability: PASS",
  "Production inventory/movement mutation: NONE",
], "A2.3 acceptance artifact");

console.log("A2.3 stock operations + scanning contract: PASS");
