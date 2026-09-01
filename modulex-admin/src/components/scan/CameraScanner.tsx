"use client";

import ComponentCard from "@/components/common/ComponentCard";
import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Html5Qrcode,
  Html5QrcodeCameraScanConfig,
} from "html5-qrcode";

type CameraScannerProps = {
  onScanSuccess: (
    decodedText: string
  ) =>
    | void
    | Promise<void>;
};

const SCANNER_REGION_ID =
  "modulex-camera-scanner";

const SAME_VALUE_COOLDOWN_MS =
  2200;

function getErrorMessage(
  error: unknown
) {
  if (
    typeof error === "string"
  ) {
    return error;
  }

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Camera could not be started.";
}

export default function CameraScanner({
  onScanSuccess,
}: CameraScannerProps) {
  const scannerRef =
    useRef<Html5Qrcode | null>(
      null
    );

  const mountedRef =
    useRef(true);

  const processingRef =
    useRef(false);

  const onScanSuccessRef =
    useRef(onScanSuccess);

  const lastScanRef =
    useRef<{
      value: string;
      timestamp: number;
    }>({
      value: "",
      timestamp: 0,
    });

  const [
    isStarting,
    setIsStarting,
  ] = useState(true);

  const [
    isScanning,
    setIsScanning,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    lastScannedValue,
    setLastScannedValue,
  ] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    onScanSuccessRef.current =
      onScanSuccess;
  }, [onScanSuccess]);

  async function handleDecodedValue(
    decodedText: string
  ) {
    const value =
      decodedText.trim();

    if (!value) {
      return;
    }

    const now =
      Date.now();

    if (
      lastScanRef.current
        .value === value &&
      now -
      lastScanRef.current
        .timestamp <
      SAME_VALUE_COOLDOWN_MS
    ) {
      return;
    }

    if (
      processingRef.current
    ) {
      return;
    }

    processingRef.current =
      true;

    lastScanRef.current = {
      value,
      timestamp: now,
    };

    if (
      mountedRef.current
    ) {
      setLastScannedValue(
        value
      );

      setErrorMessage(null);
    }

    if (
      typeof navigator !==
      "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate?.(
        60
      );
    }

    try {
      await onScanSuccessRef.current(
        value
      );
    } catch (error) {
      console.error(
        "Scan processing error:",
        error
      );

      if (
        mountedRef.current
      ) {
        setErrorMessage(
          `Scan could not be processed: ${getErrorMessage(
            error
          )}`
        );
      }
    } finally {
      processingRef.current =
        false;
    }
  }

  async function startScanner() {
    if (
      scannerRef.current
        ?.isScanning
    ) {
      return;
    }

    if (
      mountedRef.current
    ) {
      setIsStarting(true);
      setErrorMessage(null);
    }

    try {
      // html5-qrcode is one of the heavier client dependencies in the admin app.
      // Load its runtime only when the camera component is actually mounted instead
      // of including it in the initial /scan route bundle.
      const {
        Html5Qrcode: Html5QrcodeRuntime,
        Html5QrcodeSupportedFormats,
      } = await import("html5-qrcode");

      if (
        !mountedRef.current
      ) {
        return;
      }

      if (
        !scannerRef.current
      ) {
        scannerRef.current =
          new Html5QrcodeRuntime(
            SCANNER_REGION_ID,
            {
              formatsToSupport:
                [
                  Html5QrcodeSupportedFormats.QR_CODE,

                  Html5QrcodeSupportedFormats.CODE_128,

                  Html5QrcodeSupportedFormats.CODE_39,

                  Html5QrcodeSupportedFormats.EAN_13,

                  Html5QrcodeSupportedFormats.EAN_8,

                  Html5QrcodeSupportedFormats.UPC_A,

                  Html5QrcodeSupportedFormats.UPC_E,
                ],

              verbose: false,
            }
          );
      }

      const config: Html5QrcodeCameraScanConfig =
      {
        fps: 12,

        qrbox: (
          viewfinderWidth,
          viewfinderHeight
        ) => {
          const size =
            Math.floor(
              Math.min(
                viewfinderWidth,
                viewfinderHeight
              ) * 0.72
            );

          return {
            width:
              Math.max(
                180,
                Math.min(
                  size,
                  300
                )
              ),

            height:
              Math.max(
                180,
                Math.min(
                  size,
                  300
                )
              ),
          };
        },

        aspectRatio:
          1.333333,

        disableFlip:
          false,
      };

      await scannerRef.current.start(
        {
          facingMode:
            "environment",
        },

        config,

        (
          decodedText
        ) => {
          void handleDecodedValue(
            decodedText
          );
        },

        () => {
          // Frame decode failures are expected while looking for a label.
        }
      );

      if (
        mountedRef.current
      ) {
        setIsScanning(true);
        setIsStarting(false);
      }
    } catch (error) {
      console.error(
        "Camera start error:",
        error
      );

      if (
        mountedRef.current
      ) {
        setIsScanning(false);
        setIsStarting(false);

        setErrorMessage(
          getErrorMessage(
            error
          )
        );
      }
    }
  }

  async function stopScanner() {
    const scanner =
      scannerRef.current;

    if (!scanner) {
      return;
    }

    try {
      if (
        scanner.isScanning
      ) {
        await scanner.stop();
      }
    } catch (error) {
      console.error(
        "Camera stop error:",
        error
      );
    }

    try {
      scanner.clear();
    } catch {
      // Scanner may already be cleared.
    }
  }

  useEffect(() => {
    mountedRef.current =
      true;

    void startScanner();

    return () => {
      mountedRef.current =
        false;

      void stopScanner();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ComponentCard
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
    </ComponentCard>
  );
}
