"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeCameraScanConfig,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";

type CameraDevice = {
  id: string;
  label: string;
};

type CameraScannerProps = {
  onScanSuccess: (decodedText: string) => void;
};

const scannerRegionId = "modulex-camera-scanner";

export default function CameraScanner({ onScanSuccess }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedValueRef = useRef<string | null>(null);

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingCameras, setIsLoadingCameras] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastScannedValue, setLastScannedValue] = useState<string | null>(null);

  async function loadCameras() {
    setIsLoadingCameras(true);
    setErrorMessage(null);

    try {
      const devices = await Html5Qrcode.getCameras();

      const mappedDevices = devices.map((device) => ({
        id: device.id,
        label: device.label || `Camera ${device.id}`,
      }));

      setCameras(mappedDevices);

      if (mappedDevices.length > 0 && !selectedCameraId) {
        const preferredCamera =
          mappedDevices.find((device) =>
            device.label.toLowerCase().includes("back")
          ) ||
          mappedDevices.find((device) =>
            device.label.toLowerCase().includes("environment")
          ) ||
          mappedDevices[0];

        setSelectedCameraId(preferredCamera.id);
      }
    } catch (error) {
      console.error("Camera list error:", error);

      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : JSON.stringify(error);

      setErrorMessage(`Camera permission or device access failed: ${message}`);
    } finally {
      setIsLoadingCameras(false);
    }
  }

  async function startScanner() {
    setErrorMessage(null);
    lastScannedValueRef.current = null;

    try {
      let cameraId = selectedCameraId;

      if (!cameraId) {
        const devices = await Html5Qrcode.getCameras();

        if (!devices.length) {
          setErrorMessage("No camera device found.");
          return;
        }

        const mappedDevices = devices.map((device) => ({
          id: device.id,
          label: device.label || `Camera ${device.id}`,
        }));

        setCameras(mappedDevices);

        const preferredCamera =
          mappedDevices.find((device) =>
            device.label.toLowerCase().includes("back")
          ) ||
          mappedDevices.find((device) =>
            device.label.toLowerCase().includes("environment")
          ) ||
          mappedDevices[0];

        cameraId = preferredCamera.id;
        setSelectedCameraId(cameraId);
      }

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerRegionId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          verbose: false,
        });
      }

      const config: Html5QrcodeCameraScanConfig = {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250,
        },
        disableFlip: false,
      };

      await scannerRef.current.start(
        cameraId,
        config,
        async (decodedText) => {
          if (!decodedText) return;

          if (lastScannedValueRef.current === decodedText) {
            return;
          }

          lastScannedValueRef.current = decodedText;
          setLastScannedValue(decodedText);

          onScanSuccess(decodedText);

          if (scannerRef.current?.isScanning) {
            await scannerRef.current.stop();
            setIsScanning(false);
          }
        },
        () => {
          // Frame-level scan errors are normal while camera is searching.
        }
      );

      setIsScanning(true);
    } catch (error) {
      console.error("Camera start error:", error);

      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : JSON.stringify(error);

      setErrorMessage(`Camera could not be started: ${message}`);
      setIsScanning(false);
    }
  }

  async function stopScanner() {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }

      setIsScanning(false);
    } catch (error) {
      console.error("Camera stop error:", error);

      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : JSON.stringify(error);

      setErrorMessage(`Camera could not be stopped: ${message}`);
    }
  }

  useEffect(() => {
    loadCameras();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => { });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Camera Scanner
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Use your device camera to scan shelf QR labels or product barcodes.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {errorMessage && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {errorMessage}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
            Camera Device
          </label>
          <select
            value={selectedCameraId}
            onChange={(event) => setSelectedCameraId(event.target.value)}
            disabled={isScanning || isLoadingCameras}
            className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">
              {isLoadingCameras ? "Loading cameras..." : "Select camera"}
            </option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
          <div id={scannerRegionId} className="min-h-[320px] w-full" />
        </div>

        {lastScannedValue && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-xs text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
            Last scanned: {lastScannedValue}
          </div>
        )}

        <div className="flex gap-3">
          {!isScanning ? (
            <button
              type="button"
              onClick={startScanner}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
            >
              Start Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopScanner}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-error-500 px-4 text-sm font-medium text-white hover:bg-error-600"
            >
              Stop Camera
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={loadCameras}
          disabled={isScanning || isLoadingCameras}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Refresh Cameras
        </button>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Camera access works on localhost or HTTPS. Close other apps using the
          camera if startup fails.
        </p>
      </div>
    </div>
  );
}