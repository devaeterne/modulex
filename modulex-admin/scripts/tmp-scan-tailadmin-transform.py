from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def load(relative: str) -> str:
    return (ROOT / relative).read_text()


def save(relative: str, value: str) -> None:
    (ROOT / relative).write_text(value)


def insert_after_directive(source: str, imports: str) -> str:
    marker = '"use client";\n\n'
    if marker not in source:
        raise RuntimeError("client directive marker missing")
    if imports.splitlines()[0] in source:
        return source
    return source.replace(marker, marker + imports + "\n", 1)


def replace_component_return(source: str, jsx: str) -> str:
    marker = "\n  return (\n"
    index = source.rfind(marker)
    if index < 0:
        raise RuntimeError("component return marker missing")
    return source[:index] + marker + jsx.rstrip() + "\n  );\n}\n"


# CameraScanner: render-only TailAdmin primitives. Scanner lifecycle and duplicate guards remain untouched.
camera_path = "src/components/scan/CameraScanner.tsx"
camera = load(camera_path)
camera = insert_after_directive(
    camera,
    '''import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
''',
)
camera = replace_component_return(
    camera,
    r'''    <ComponentCard
      title="Scan QR / Barcode"
      desc="Point the camera at the product or shelf label."
      headerAction={
        <Badge
          size="sm"
          color={isStarting ? "warning" : isScanning ? "success" : "light"}
        >
          {isStarting ? "Starting..." : isScanning ? "Scanning" : "Camera Off"}
        </Badge>
      }
    >
      {errorMessage ? (
        <div className="space-y-3">
          <Alert variant="error" title="Camera unavailable" message={errorMessage} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void startScanner();
            }}
          >
            Try Again
          </Button>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-xl bg-black">
        <div
          id={SCANNER_REGION_ID}
          className="min-h-[300px] w-full sm:min-h-[360px]"
        />

        {isStarting && !errorMessage ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
              <p className="mt-3 text-sm font-medium text-white">Opening camera...</p>
            </div>
          </div>
        ) : null}

        {isScanning ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[210px] w-[210px] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.15)] sm:h-[250px] sm:w-[250px]" />
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[58px] items-center justify-between gap-4">
        <div>
          {lastScannedValue ? (
            <>
              <Badge size="sm" color="success">Scan accepted</Badge>
              <p className="mt-1 max-w-[260px] truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
                {lastScannedValue}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Ready to scan</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Keep the label inside the frame.</p>
            </>
          )}
        </div>
        {isScanning ? <Badge size="sm" color="info">Continuous</Badge> : null}
      </div>
    </ComponentCard>''',
)
save(camera_path, camera)


# GuidedStockOperation: keep all parsing, validation, idempotency and RPC functions; replace render surface only.
guided_path = "src/components/scan/GuidedStockOperation.tsx"
guided = load(guided_path)
guided = insert_after_directive(
    guided,
    '''import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
''',
)
guided = replace_component_return(
    guided,
    r'''    <ComponentCard title={meta.title} desc={meta.description}>
      <div className="flex flex-wrap gap-2" aria-label="Stock operation progress">
        <Badge color={productReady ? "success" : "light"} size="sm">
          Product: {productReady ? "Ready" : "Waiting"}
        </Badge>
        <Badge color={sourceReady ? "success" : "light"} size="sm">
          Source: {!needsSource ? "N/A" : sourceReady ? "Ready" : "Waiting"}
        </Badge>
        <Badge color={targetReady ? "success" : "light"} size="sm">
          Target: {!needsTarget ? "N/A" : targetReady ? "Ready" : "Waiting"}
        </Badge>
      </div>

      {errorMessage ? <Alert variant="error" title="Operation blocked" message={errorMessage} /> : null}
      {successMessage ? <Alert variant="success" title="Operation complete" message={successMessage} /> : null}
      {infoMessage ? <Alert variant="info" title="Scan update" message={infoMessage} /> : null}

      <div>
        <Label htmlFor={`guided-product-${operationType}`}>Product</Label>
        <Select
          id={`guided-product-${operationType}`}
          value={productId}
          disabled={isLoadingOptions}
          placeholder="Scan or select product"
          options={products.map((product) => ({ value: product.id, label: `${product.sku} — ${product.name}` }))}
          onChange={(value) => {
            setProductId(value);
            setSourceLocationId("");
            setTargetLocationId("");
            resetMessages();
          }}
        />
      </div>

      {needsSource && productId ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label>Source Shelf</Label>
            {filteredSourceLocations.length > 1 ? (
              <Badge size="sm" color="light">{filteredSourceLocations.length} locations found</Badge>
            ) : null}
          </div>

          {isLoadingProductLocations ? (
            <Alert variant="info" title="Loading source shelves" message="Loading product locations..." />
          ) : filteredSourceLocations.length === 0 ? (
            <Alert variant="warning" title="No eligible source" message="No eligible source shelf found." />
          ) : (
            <div className="space-y-2">
              {filteredSourceLocations.map((stock) => {
                const location = locations.find((item) => item.location_id === stock.location_id);
                const isSelected = sourceLocationId === stock.location_id;
                return (
                  <button
                    key={stock.inventory_id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSourceLocationId(stock.location_id);
                      resetMessages();
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition ${isSelected ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-gray-200 hover:border-brand-300 dark:border-gray-800"}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {stock.warehouse_code} / {location?.zone_code ? `${location.zone_code} / ` : ""}{stock.location_code}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {location ? `${location.warehouse_name} · ${formatWarehouseType(location.warehouse_type)}` : stock.warehouse_name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{stock.location_name}</p>
                      </div>
                      <div className="text-right">
                        {isSelected ? <Badge color="primary" size="sm">Selected</Badge> : null}
                        <p className="mt-1 text-xs text-gray-500">Available</p>
                        <p className="text-base font-semibold text-gray-800 dark:text-white">{formatNumber(stock.available_quantity)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                      <span>On Hand: {formatNumber(stock.quantity)}</span>
                      <span>Reserved: {formatNumber(stock.reserved_quantity)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {needsTarget ? (
        <div>
          <Label htmlFor={`guided-target-${operationType}`}>Target Shelf</Label>
          <Select
            id={`guided-target-${operationType}`}
            value={targetLocationId}
            disabled={isLoadingOptions || !productId}
            placeholder="Scan or select target shelf"
            options={locations.map((location) => ({
              value: location.location_id,
              label: `${location.warehouse_code} / ${location.zone_code ? `${location.zone_code} / ` : ""}${location.location_code} — ${location.location_name}`,
            }))}
            onChange={(value) => {
              setTargetLocationId(value);
              resetMessages();
            }}
          />
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
          <p className="text-xs font-medium uppercase text-gray-500">Operation Summary</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Product</span>
              <span className="text-right font-medium text-gray-800 dark:text-white/90">{selectedProduct.sku} — {selectedProduct.name}</span>
            </div>
            {needsSource ? (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">From</span>
                <span className="text-right font-medium text-gray-800 dark:text-white/90">
                  {sourceLocation ? `${sourceLocation.warehouse_code} / ${sourceLocationMeta?.zone_code ? `${sourceLocationMeta.zone_code} / ` : ""}${sourceLocation.location_code}` : "Waiting"}
                </span>
              </div>
            ) : null}
            {needsTarget ? (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">To</span>
                <span className="text-right font-medium text-gray-800 dark:text-white/90">
                  {targetLocation ? `${targetLocation.warehouse_code} / ${targetLocation.zone_code ? `${targetLocation.zone_code} / ` : ""}${targetLocation.location_code}` : "Waiting"}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`guided-quantity-${operationType}`}>Quantity</Label>
          <Input
            id={`guided-quantity-${operationType}`}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            min="0.01"
            step="0.01"
          />
        </div>
        <div>
          <Label htmlFor={`guided-reference-${operationType}`}>Reference No</Label>
          <Input
            id={`guided-reference-${operationType}`}
            value={referenceNo}
            onChange={(event) => setReferenceNo(event.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`guided-notes-${operationType}`}>Notes</Label>
        <TextArea
          id={`guided-notes-${operationType}`}
          value={notes}
          onChange={setNotes}
          rows={2}
          placeholder="Optional"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          className="flex-1"
          onClick={() => {
            void runOperation();
          }}
          disabled={isSubmitting || !workflowReady}
        >
          {isSubmitting ? "Processing..." : meta.buttonLabel}
        </Button>
        <Button type="button" variant="outline" onClick={resetOperation} disabled={isSubmitting}>
          Reset
        </Button>
      </div>
    </ComponentCard>''',
)
save(guided_path, guided)


# ScanPanel: all query/check/process functions remain untouched; replace only the JSX workspace.
scan_path = "src/components/scan/ScanPanel.tsx"
scan = load(scan_path)
scan = insert_after_directive(
    scan,
    '''import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
''',
)
scan = re.sub(
    r'\nfunction activeBadge\([\s\S]*?\n}\n\nexport default function ScanPanel',
    '\nexport default function ScanPanel',
    scan,
    count=1,
)
scan = replace_component_return(
    scan,
    r'''    <div className="space-y-6">
      <ComponentCard
        title="What do you want to do?"
        desc="Select an action, then scan the required product or shelf QR."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {operationOptions.map((item) => {
            const selected = operation === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={selected}
                onClick={() => handleOperationChange(item.value)}
                className={`rounded-xl border px-3 py-4 text-left transition ${selected ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-gray-200 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{item.label}</p>
                  {selected ? <Badge color="primary" size="sm">Active</Badge> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.description}</p>
              </button>
            );
          })}
        </div>
      </ComponentCard>

      <ComponentCard
        title={selectedOperation?.label ?? "Scan"}
        desc={selectedOperation?.description ?? "Scan a label to continue."}
        headerAction={
          <Button
            type="button"
            variant={showCamera ? "outline" : "primary"}
            onClick={() => setShowCamera((current) => !current)}
          >
            {showCamera ? "Hide Camera" : "Scan with Camera"}
          </Button>
        }
      >
        <div>
          <Label htmlFor="scan-manual-input">Manual Input / Hardware Scanner</Label>
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                id="scan-manual-input"
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                autoComplete="off"
                placeholder="Scan or enter QR, SKU, or barcode..."
                className="font-mono"
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Checking..." : "Submit"}
            </Button>
          </form>
        </div>
      </ComponentCard>

      {showCamera ? <CameraScanner onScanSuccess={handleCameraScan} /> : null}

      {errorMessage ? <Alert variant="error" title="Scan could not be completed" message={errorMessage} /> : null}

      {operation !== "check" ? (
        <GuidedStockOperation
          key={operation}
          operationType={operation}
          scannedValue={workflowScan.value}
          scanNonce={workflowScan.nonce}
          onWorkflowReadyChange={handleWorkflowReady}
        />
      ) : null}

      {operation === "check" && !checkResult && !errorMessage && !isLoading ? (
        <ComponentCard title="Scan anything" desc="Scan a product to see where it is stored, or scan a shelf to see which products are currently there.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {["Warehouse", "Zone", "Location", "Product"].map((item) => (
              <div key={item} className="rounded-xl bg-gray-50 p-3 text-center text-xs font-medium text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                {item}
              </div>
            ))}
          </div>
        </ComponentCard>
      ) : null}

      {operation === "check" && isLoading ? (
        <ComponentCard title="Checking scan">
          <div className="py-6 text-center" role="status">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Checking...</p>
          </div>
        </ComponentCard>
      ) : null}

      {checkResult?.type === "warehouse" ? (
        <ComponentCard
          title={`${checkResult.data.code} — ${checkResult.data.name}`}
          desc={formatText(checkResult.data.warehouse_type)}
          headerAction={<Badge color={checkResult.data.is_active ? "success" : "light"} size="sm">{checkResult.data.is_active ? "Active" : "Inactive"}</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Zones", checkResult.data.zone_count],
              ["Locations", checkResult.data.location_count],
              ["On Hand", checkResult.data.total_quantity],
              ["Reserved", checkResult.data.reserved_quantity],
              ["Available", checkResult.data.available_quantity],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">{formatNumber(value)}</p>
              </div>
            ))}
          </div>
          {checkResult.data.description ? <p className="text-sm text-gray-500 dark:text-gray-400">{checkResult.data.description}</p> : null}
          <Button type="button" variant="outline" onClick={() => setShowCamera(true)}>Scan Again</Button>
        </ComponentCard>
      ) : null}

      {checkResult?.type === "zone" ? (
        <ComponentCard
          title={`${checkResult.data.warehouse_code} / ${checkResult.data.code} — ${checkResult.data.name}`}
          desc={checkResult.data.warehouse_name}
          headerAction={<Badge color={checkResult.data.is_active ? "success" : "light"} size="sm">{checkResult.data.is_active ? "Active" : "Inactive"}</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Locations", checkResult.data.location_count],
              ["On Hand", checkResult.data.total_quantity],
              ["Reserved", checkResult.data.reserved_quantity],
              ["Available", checkResult.data.available_quantity],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">{formatNumber(value)}</p>
              </div>
            ))}
          </div>
          {checkResult.data.description ? <p className="text-sm text-gray-500 dark:text-gray-400">{checkResult.data.description}</p> : null}
          <Button type="button" variant="outline" onClick={() => setShowCamera(true)}>Scan Again</Button>
        </ComponentCard>
      ) : null}

      {checkResult?.type === "location" ? (
        <ComponentCard
          title={`${checkResult.data.warehouse_code} / ${checkResult.data.zone_code ? `${checkResult.data.zone_code} / ` : ""}${checkResult.data.code} — ${checkResult.data.name}`}
          desc={`${checkResult.data.warehouse_name}${checkResult.data.zone_name ? ` · ${checkResult.data.zone_name}` : ""} · ${formatText(checkResult.data.location_type)}`}
          headerAction={<Badge color={checkResult.data.is_active ? "success" : "light"} size="sm">{checkResult.data.is_active ? "Active" : "Inactive"}</Badge>}
        >
          {locationInventory.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No stock is currently recorded on this shelf.</p>
          ) : (
            <div className="space-y-2">
              {locationInventory.map((item) => (
                <div key={item.inventory_id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{item.sku} — {item.product_name}</p>
                      {item.barcode ? <p className="mt-1 font-mono text-xs text-gray-500">{item.barcode}</p> : null}
                    </div>
                    <Badge color={Number(item.available_quantity) > 0 ? "success" : "light"} size="sm">{formatText(item.stock_status)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>On Hand: {formatNumber(item.quantity)}</span>
                    <span>Reserved: {formatNumber(item.reserved_quantity)}</span>
                    <span>Available: {formatNumber(item.available_quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button type="button" variant="outline" onClick={() => setShowCamera(true)}>Scan Again</Button>
        </ComponentCard>
      ) : null}

      {checkResult?.type === "product" ? (
        <ComponentCard
          title={`${checkResult.data.sku} — ${checkResult.data.name}`}
          desc={[checkResult.data.brand, checkResult.data.category, checkResult.data.unit].filter(Boolean).join(" · ")}
          headerAction={<Badge color={checkResult.data.status === "active" ? "success" : "light"} size="sm">{formatText(checkResult.data.status)}</Badge>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
              <p className="text-xs text-gray-500">Barcode</p>
              <p className="mt-1 break-all font-mono text-sm font-medium text-gray-800 dark:text-white/90">{checkResult.data.barcode ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
              <p className="text-xs text-gray-500">QR Value</p>
              <p className="mt-1 break-all font-mono text-sm font-medium text-gray-800 dark:text-white/90">{checkResult.data.qr_value ?? "—"}</p>
            </div>
          </div>
          {productStock.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No shelf stock was found for this product.</p>
          ) : (
            <div className="space-y-2">
              {productStock.map((item) => (
                <div key={item.inventory_id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        {item.warehouse_code} / {item.zone_code ? `${item.zone_code} / ` : ""}{item.location_code}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.warehouse_name} · {item.location_name}</p>
                    </div>
                    <Badge color={Number(item.available_quantity) > 0 ? "success" : "light"} size="sm">{formatText(item.stock_status)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>On Hand: {formatNumber(item.quantity)}</span>
                    <span>Reserved: {formatNumber(item.reserved_quantity)}</span>
                    <span>Available: {formatNumber(item.available_quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button type="button" variant="outline" onClick={() => setShowCamera(true)}>Scan Again</Button>
        </ComponentCard>
      ) : null}
    </div>''',
)
save(scan_path, scan)

print("scan TailAdmin transform complete")
