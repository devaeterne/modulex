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

type CameraDevice = {
  id: string;
  label: string;
};

type ScanBehavior =
  | "single"
  | "continuous";

type CameraScannerProps = {
  onScanSuccess: (
    decodedText: string
  ) =>
    | void
    | Promise<void>;
};

const scannerRegionId =
  "modulex-camera-scanner";

const SAME_VALUE_COOLDOWN_MS =
  2500;

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

  try {
    return JSON.stringify(
      error
    );
  } catch {
    return "Unknown camera error.";
  }
}

function choosePreferredCamera(
  cameras: CameraDevice[]
) {
  return (
    cameras.find(
      (camera) =>
        camera.label
          .toLowerCase()
          .includes("back")
    ) ||
    cameras.find(
      (camera) =>
        camera.label
          .toLowerCase()
          .includes(
            "environment"
          )
    ) ||
    cameras.find(
      (camera) =>
        camera.label
          .toLowerCase()
          .includes("rear")
    ) ||
    cameras[0] ||
    null
  );
}

export default function CameraScanner({
  onScanSuccess,
}: CameraScannerProps) {
  const scannerRef =
    useRef<Html5Qrcode | null>(
      null
    );

  const processingScanRef =
    useRef(false);

  const lastScanRef =
    useRef<{
      value: string;
      timestamp: number;
    }>({
      value: "",
      timestamp: 0,
    });

  const [
    cameras,
    setCameras,
  ] = useState<
    CameraDevice[]
  >([]);

  const [
    selectedCameraId,
    setSelectedCameraId,
  ] = useState("");

  const [
    scanBehavior,
    setScanBehavior,
  ] =
    useState<ScanBehavior>(
      "continuous"
    );

  const [
    isScanning,
    setIsScanning,
  ] =
    useState(false);

  const [
    isLoadingCameras,
    setIsLoadingCameras,
  ] =
    useState(false);

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

  const [
    successfulScanCount,
    setSuccessfulScanCount,
  ] =
    useState(0);

  async function loadCameras() {
    if (isScanning) {
      return;
    }

    setIsLoadingCameras(
      true
    );

    setErrorMessage(null);

    try {
      const devices =
        await Html5Qrcode.getCameras();

      const mappedDevices =
        devices.map(
          (device) => ({
            id: device.id,

            label:
              device.label ||
              `Camera ${device.id}`,
          })
        );

      setCameras(
        mappedDevices
      );

      if (
        mappedDevices.length ===
        0
      ) {
        setSelectedCameraId(
          ""
        );

        setErrorMessage(
          "No camera device found."
        );

        return;
      }

      const currentStillExists =
        mappedDevices.some(
          (camera) =>
            camera.id ===
            selectedCameraId
        );

      if (
        !selectedCameraId ||
        !currentStillExists
      ) {
        const preferredCamera =
          choosePreferredCamera(
            mappedDevices
          );

        if (
          preferredCamera
        ) {
          setSelectedCameraId(
            preferredCamera.id
          );
        }
      }
    } catch (error) {
      console.error(
        "Camera list error:",
        error
      );

      setErrorMessage(
        `Camera permission or device access failed: ${getErrorMessage(
          error
        )}`
      );
    } finally {
      setIsLoadingCameras(
        false
      );
    }
  }

  async function resolveCameraId() {
    if (
      selectedCameraId
    ) {
      return selectedCameraId;
    }

    const devices =
      await Html5Qrcode.getCameras();

    if (!devices.length) {
      return null;
    }

    const mappedDevices =
      devices.map(
        (device) => ({
          id: device.id,

          label:
            device.label ||
            `Camera ${device.id}`,
        })
      );

    setCameras(
      mappedDevices
    );

    const preferredCamera =
      choosePreferredCamera(
        mappedDevices
      );

    if (!preferredCamera) {
      return null;
    }

    setSelectedCameraId(
      preferredCamera.id
    );

    return preferredCamera.id;
  }

  async function stopScanner() {
    try {
      if (
        scannerRef.current
          ?.isScanning
      ) {
        await scannerRef.current.stop();
      }

      setIsScanning(false);

      processingScanRef.current =
        false;
    } catch (error) {
      console.error(
        "Camera stop error:",
        error
      );

      setErrorMessage(
        `Camera could not be stopped: ${getErrorMessage(
          error
        )}`
      );

      setIsScanning(false);
    }
  }

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
     * Prevent the same QR from
     * repeatedly triggering while
     * the camera is still pointing
     * at the same label.
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
     * Prevent overlapping async
     * stock/lookup operations.
     */
    if (
      processingScanRef.current
    ) {
      return;
    }

    processingScanRef.current =
      true;

    lastScanRef.current = {
      value,
      timestamp: now,
    };

    setLastScannedValue(
      value
    );

    setSuccessfulScanCount(
      (current) =>
        current + 1
    );

    setErrorMessage(null);

    /*
     * Small vibration feedback
     * on supported mobile devices.
     */
    if (
      typeof navigator !==
      "undefined" &&
      "vibrate" in navigator
    ) {
      navigator.vibrate?.(
        70
      );
    }

    try {
      await onScanSuccess(
        value
      );
    } catch (error) {
      console.error(
        "Scan processing error:",
        error
      );

      setErrorMessage(
        `Scanned value could not be processed: ${getErrorMessage(
          error
        )}`
      );
    } finally {
      processingScanRef.current =
        false;
    }

    /*
     * SINGLE SCAN
     *
     * Stop camera after one
     * successful scan.
     */
    if (
      scanBehavior ===
      "single"
    ) {
      try {
        if (
          scannerRef.current
            ?.isScanning
        ) {
          await scannerRef.current.stop();
        }

        setIsScanning(
          false
        );
      } catch (error) {
        console.error(
          "Camera auto-stop error:",
          error
        );

        setErrorMessage(
          `Scan succeeded, but the camera could not be stopped automatically: ${getErrorMessage(
            error
          )}`
        );
      }
    }
  }

  async function startScanner() {
    if (isScanning) {
      return;
    }

    setErrorMessage(null);

    processingScanRef.current =
      false;

    lastScanRef.current = {
      value: "",
      timestamp: 0,
    };

    try {
      const cameraId =
        await resolveCameraId();

      if (!cameraId) {
        setErrorMessage(
          "No camera device found."
        );

        return;
      }

      if (
        !scannerRef.current
      ) {
        scannerRef.current =
          new Html5Qrcode(
            scannerRegionId,
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

      /*
       * If scanner somehow remained
       * active, stop before starting
       * another stream.
       */
      if (
        scannerRef.current
          .isScanning
      ) {
        await scannerRef.current.stop();
      }

      const config: Html5QrcodeCameraScanConfig =
      {
        fps: 12,

        qrbox: {
          width: 250,
          height: 250,
        },

        disableFlip:
          false,
      };

      await scannerRef.current.start(
        cameraId,

        config,

        async (
          decodedText
        ) => {
          await handleDecodedValue(
            decodedText
          );
        },

        () => {
          /*
           * Frame-level errors
           * are expected while
           * searching for a QR
           * or barcode.
           */
        }
      );

      setIsScanning(true);
    } catch (error) {
      console.error(
        "Camera start error:",
        error
      );

      setErrorMessage(
        `Camera could not be started: ${getErrorMessage(
          error
        )}`
      );

      setIsScanning(false);
    }
  }

  function clearLastScan() {
    setLastScannedValue(
      null
    );

    setSuccessfulScanCount(
      0
    );

    lastScanRef.current = {
      value: "",
      timestamp: 0,
    };
  }

  useEffect(() => {
    loadCameras();

    return () => {
      const scanner =
        scannerRef.current;

      if (
        scanner?.isScanning
      ) {
        scanner
          .stop()
          .catch(() => { });
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* HEADER */}
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Camera Scanner
          </h3>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Scan warehouse,
            zone, shelf QR
            labels or product
            barcodes.
          </p>
        </div>

        <span
          className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${isScanning
            ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
            : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
            }`}
        >
          {isScanning
            ? "Scanning"
            : "Camera Off"}
        </span>
      </div>

      <div className="space-y-5 p-5">
        {/* ERROR */}
        {errorMessage && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        {/* SCAN MODE */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Scan Behavior
          </label>

          <select
            value={scanBehavior}
            onChange={(event) =>
              setScanBehavior(
                event.target
                  .value as ScanBehavior
              )
            }
            disabled={isScanning}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="continuous">
              Continuous Scan
            </option>

            <option value="single">
              Single Scan
            </option>
          </select>

          <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {scanBehavior ===
              "continuous"
              ? "Camera stays active after each scan. Recommended for warehouse stock workflows."
              : "Camera stops automatically after one successful scan."}
          </p>
        </div>

        {/* CAMERA DEVICE */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Camera Device
          </label>

          <select
            value={
              selectedCameraId
            }
            onChange={(
              event
            ) =>
              setSelectedCameraId(
                event.target
                  .value
              )
            }
            disabled={
              isScanning ||
              isLoadingCameras
            }
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">
              {isLoadingCameras
                ? "Loading cameras..."
                : "Select camera"}
            </option>

            {cameras.map(
              (camera) => (
                <option
                  key={
                    camera.id
                  }
                  value={
                    camera.id
                  }
                >
                  {
                    camera.label
                  }
                </option>
              )
            )}
          </select>
        </div>

        {/* CAMERA VIEW */}
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-950 dark:border-gray-800">
          <div
            id={
              scannerRegionId
            }
            className="min-h-[320px] w-full"
          />

          {!isScanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl bg-black/60 px-5 py-3 text-center text-white">
                <p className="text-sm font-medium">
                  Camera is off
                </p>

                <p className="mt-1 text-xs text-white/70">
                  Press Start
                  Camera to begin
                  scanning.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* CONTINUOUS MODE INFO */}
        {isScanning &&
          scanBehavior ===
          "continuous" && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-500/30 dark:bg-brand-500/10">
              <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
                Continuous
                scanning is active
              </p>

              <p className="mt-1 text-xs leading-5 text-brand-600 dark:text-brand-400/80">
                You can scan the
                next item without
                restarting the
                camera. For a
                transfer, scan
                Product → Source
                Shelf → Target
                Shelf.
              </p>
            </div>
          )}

        {/* LAST SCAN */}
        {lastScannedValue && (
          <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-500/30 dark:bg-success-500/10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-success-600 dark:text-success-400">
                  Last Scanned
                </p>

                <p className="mt-1 break-all font-mono text-sm font-semibold text-success-800 dark:text-success-300">
                  {
                    lastScannedValue
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={
                  clearLastScan
                }
                className="shrink-0 rounded-lg border border-success-200 px-2.5 py-1 text-xs font-medium text-success-700 hover:bg-success-100 dark:border-success-500/30 dark:text-success-400 dark:hover:bg-success-500/10"
              >
                Clear
              </button>
            </div>

            {successfulScanCount >
              1 && (
                <p className="mt-2 text-xs text-success-600 dark:text-success-400">
                  {
                    successfulScanCount
                  }{" "}
                  scans completed
                  during this
                  session.
                </p>
              )}
          </div>
        )}

        {/* CAMERA BUTTONS */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {!isScanning ? (
            <button
              type="button"
              onClick={
                startScanner
              }
              disabled={
                isLoadingCameras
              }
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={
                stopScanner
              }
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-error-500 px-4 text-sm font-medium text-white transition hover:bg-error-600"
            >
              Stop Camera
            </button>
          )}

          <button
            type="button"
            onClick={
              loadCameras
            }
            disabled={
              isScanning ||
              isLoadingCameras
            }
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            {isLoadingCameras
              ? "Refreshing..."
              : "Refresh Cameras"}
          </button>
        </div>

        {/* HELP */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Scanner Tips
          </p>

          <div className="mt-2 space-y-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            <p>
              • Use Continuous
              Scan for Stock In,
              Stock Out,
              Transfer, Reserve,
              and Release
              workflows.
            </p>

            <p>
              • Keep the entire QR
              code inside the scan
              area.
            </p>

            <p>
              • Move the camera
              slightly away from a
              scanned QR before
              scanning the next
              label.
            </p>

            <p>
              • Camera access
              requires HTTPS or
              localhost.
            </p>

            <p>
              • Close other apps
              using the camera if
              startup fails.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}