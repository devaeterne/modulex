"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Html5Qrcode,
  Html5QrcodeCameraScanConfig,
  Html5QrcodeSupportedFormats,
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

  /*
   * Always keep latest parent
   * callback without restarting
   * the camera on every render.
   */
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

    /*
     * Avoid repeatedly scanning
     * the same label while the
     * camera is still pointing
     * at it.
     */
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

    /*
     * Do not start another
     * lookup while the previous
     * scan is still processing.
     */
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

    /*
     * Small scan feedback on
     * supported mobile devices.
     */
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
      if (
        !scannerRef.current
      ) {
        scannerRef.current =
          new Html5Qrcode(
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

      /*
       * Prefer rear camera.
       *
       * No camera selection screen
       * is necessary for normal
       * warehouse use.
       */
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
          /*
           * Frame decode failures
           * are normal while the
           * scanner is looking for
           * a QR or barcode.
           */
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

  /*
   * Camera starts automatically
   * as soon as this component
   * appears on screen.
   *
   * ScanPanel unmounts the
   * component when camera is no
   * longer needed.
   */
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
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Scan QR / Barcode
          </h3>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Point the camera at
            the product or shelf
            label.
          </p>
        </div>

        <div className="shrink-0">
          {isStarting ? (
            <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
              Starting...
            </span>
          ) : isScanning ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" />

              Scanning
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
              Camera Off
            </span>
          )}
        </div>
      </div>

      {/* ERROR */}
      {errorMessage && (
        <div className="border-b border-error-200 bg-error-50 px-5 py-4 dark:border-error-500/30 dark:bg-error-500/10">
          <p className="text-sm font-medium text-error-600 dark:text-error-400">
            Camera unavailable
          </p>

          <p className="mt-1 text-xs leading-5 text-error-500 dark:text-error-400">
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={() => {
              void startScanner();
            }}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-error-500 px-4 text-xs font-medium text-white hover:bg-error-600"
          >
            Try Again
          </button>
        </div>
      )}

      {/* CAMERA */}
      <div className="relative bg-black">
        <div
          id={
            SCANNER_REGION_ID
          }
          className="min-h-[300px] w-full sm:min-h-[360px]"
        />

        {/* STARTING OVERLAY */}
        {isStarting &&
          !errorMessage && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />

                <p className="mt-3 text-sm font-medium text-white">
                  Opening camera...
                </p>
              </div>
            </div>
          )}

        {/* SIMPLE TARGET GUIDE */}
        {isScanning && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[210px] w-[210px] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.15)] sm:h-[250px] sm:w-[250px]" />
          </div>
        )}
      </div>

      {/* BOTTOM STATUS */}
      <div className="flex min-h-[58px] items-center justify-between gap-4 px-5 py-3">
        <div>
          {lastScannedValue ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-success-600 dark:text-success-400">
                Scan accepted
              </p>

              <p className="mt-0.5 max-w-[260px] truncate font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
                {
                  lastScannedValue
                }
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Ready to scan
              </p>

              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Keep the label
                inside the frame.
              </p>
            </>
          )}
        </div>

        {isScanning && (
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
            Continuous
          </span>
        )}
      </div>
    </div>
  );
}