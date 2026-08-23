import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, UploadCloud, AlertCircle, Zap, ZapOff, ZoomIn, RefreshCw } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { playScanBeep } from '../services/storage';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const SUPPORTED_FORMATS_BARCODE_DETECTOR = [
  'ean_13',
  'ean_8',
  'code_128',
  'code_39',
  'upc_a',
  'upc_e',
  'itf',
  'qr_code',
  'data_matrix',
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomAvailable, setZoomAvailable] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [manualCode, setManualCode] = useState('');
  const [scanningEngine, setScanningEngine] = useState<'native' | 'html5' | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const detectIntervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  const scannerContainerId = 'superfood-barcode-reader';

  // Handle successful detection
  const handleSuccess = useCallback(
    (decodedText: string) => {
      const clean = decodedText.trim();
      if (!clean) return;

      playScanBeep();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100);
        } catch {
          /* ignore */
        }
      }

      cleanupAll();
      onScan(clean);
      onClose();
    },
    [onScan, onClose]
  );

  const cleanupAll = useCallback(() => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().catch(() => {});
        }
        html5QrCodeRef.current.clear();
      } catch {
        /* ignore */
      }
      html5QrCodeRef.current = null;
    }

    setIsScanning(false);
    setTorchOn(false);
    setTorchAvailable(false);
    setZoomAvailable(false);
    setCurrentZoom(1);
    isProcessingRef.current = false;
  }, []);

  // ── Engine 1: Native BarcodeDetector (Ultra-fast AI/hardware on Mobile Chrome/Safari) ──
  const startNativeScanner = useCallback(
    async (deviceId?: string) => {
      cleanupAll();
      setCameraError(null);

      try {
        const videoConstraints: MediaTrackConstraints = {
          facingMode: deviceId ? undefined : { ideal: 'environment' },
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Fallback with simpler constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false,
          });
        }

        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) {
          // Check capabilities (Torch & Zoom)
          if ('getCapabilities' in track) {
            const caps = (track.getCapabilities as () => MediaTrackCapabilities)();
            if ('torch' in caps) setTorchAvailable(true);
            if ('zoom' in caps) setZoomAvailable(true);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector!({
          formats: SUPPORTED_FORMATS_BARCODE_DETECTOR,
        });

        setScanningEngine('native');
        setIsScanning(true);

        // Continuous detection loop (~25 fps)
        detectIntervalRef.current = window.setInterval(async () => {
          if (
            isProcessingRef.current ||
            !videoRef.current ||
            videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            return;
          }

          isProcessingRef.current = true;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const detected = barcodes[0].rawValue;
              if (detected) {
                handleSuccess(detected);
              }
            }
          } catch {
            // Frame drop, ignore
          } finally {
            isProcessingRef.current = false;
          }
        }, 70);
      } catch (err: unknown) {
        console.warn('[Scanner] Error with native scanner, trying Html5Qrcode fallback:', err);
        startHtml5Scanner(deviceId);
      }
    },
    [cleanupAll, handleSuccess]
  );

  // ── Engine 2: Html5Qrcode Fallback (ZXing with optimized HD constraints) ──
  const startHtml5Scanner = useCallback(
    async (deviceId?: string) => {
      cleanupAll();
      setCameraError(null);

      try {
        const html5QrCode = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = html5QrCode;

        const config = {
          fps: 25,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.max(260, Math.floor(viewfinderWidth * 0.88));
            const height = Math.max(140, Math.floor(viewfinderHeight * 0.5));
            return { width, height };
          },
          aspectRatio: undefined,
          videoConstraints: {
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
        };

        const cameraToUse = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' };

        await html5QrCode.start(
          cameraToUse,
          config,
          (decodedText) => {
            handleSuccess(decodedText);
          },
          () => {
            // Ignore scan frame misses
          }
        );

        setScanningEngine('html5');
        setIsScanning(true);
      } catch (err: unknown) {
        console.error('[Scanner] Html5Qrcode error:', err);
        setCameraError(
          'No se pudo acceder a la cámara. Revisa que diste permiso en el navegador o usa las opciones de abajo.'
        );
        setIsScanning(false);
      }
    },
    [cleanupAll, handleSuccess]
  );

  // Initialize camera and start scanner
  useEffect(() => {
    if (!isOpen) {
      cleanupAll();
      return;
    }

    setCameraError(null);
    setIsScanning(false);

    // List cameras
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoDevices = devices.filter((d) => d.kind === 'videoinput');
          if (videoDevices.length > 0) {
            setCameras(
              videoDevices.map((d, i) => ({
                id: d.deviceId,
                label: d.label || `Cámara ${i + 1}`,
              }))
            );
          }
        })
        .catch(() => {});
    }

    // Determine engine: Native BarcodeDetector if available, otherwise Html5Qrcode
    const hasNativeBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    if (hasNativeBarcodeDetector) {
      startNativeScanner();
    } else {
      startHtml5Scanner();
    }

    return () => {
      cleanupAll();
    };
  }, [isOpen, startNativeScanner, startHtml5Scanner, cleanupAll]);

  // Toggle Torch (Linterna)
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextState = !torchOn;
        await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Could not toggle torch:', e);
      }
    }
  };

  // Toggle Zoom
  const toggleZoom = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextZoom = currentZoom === 1 ? 2 : 1;
        await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
          advanced: [{ zoom: nextZoom }],
        });
        setCurrentZoom(nextZoom);
      } catch (e) {
        console.warn('Could not apply zoom:', e);
      }
    }
  };

  // Switch camera manually
  const handleCameraSelect = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      await startNativeScanner(cameraId);
    } else {
      await startHtml5Scanner(cameraId);
    }
  };

  // Scan from uploaded file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Try native BarcodeDetector on ImageBitmap first
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const bitmap = await createImageBitmap(file);
          const detector = new window.BarcodeDetector({
            formats: SUPPORTED_FORMATS_BARCODE_DETECTOR,
          });
          const barcodes = await detector.detect(bitmap);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleSuccess(barcodes[0].rawValue);
            return;
          }
        } catch {
          // Fall through to Html5Qrcode
        }
      }

      // 2. Fallback to Html5Qrcode scanFile
      const tempScanner = new Html5Qrcode('temp-file-scanner');
      const result = await tempScanner.scanFile(file, true);
      handleSuccess(result);
    } catch {
      alert('No se pudo detectar un código de barras en la imagen. Intenta con una foto más nítida o escribe el código.');
    }
  };

  const handleApplyManual = () => {
    if (!manualCode.trim()) return;
    handleSuccess(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div
      id="barcode-scanner-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="barcode-scanner-modal"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/90 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900 leading-none">
                Escanear Código de Barras
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Apunta la cámara al código EAN-13, UPC o QR
              </p>
            </div>
          </div>
          <button
            id="close-scanner-button"
            onClick={() => {
              cleanupAll();
              onClose();
            }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5">
          {/* Camera Viewport Area */}
          <div className="relative overflow-hidden rounded-xl bg-black aspect-4/3 flex flex-col items-center justify-center border border-gray-800 shadow-inner">
            {/* Native Video Element */}
            {scanningEngine === 'native' ? (
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                id={scannerContainerId}
                className="w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
              />
            )}

            <div id="temp-file-scanner" className="hidden" />

            {/* Target Reticle Frame for Barcodes (Horizontal Rect) */}
            {isScanning && !cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-[82%] h-[48%] border-2 border-emerald-400/90 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  {/* Corner accents */}
                  <span className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-emerald-400 rounded-tl" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-emerald-400 rounded-tr" />
                  <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-emerald-400 rounded-bl" />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-emerald-400 rounded-br" />

                  {/* Horizontal animated laser guide */}
                  <div className="w-full h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse relative top-1/2 -translate-y-1/2 opacity-80" />
                </div>
              </div>
            )}

            {/* In-Camera Floating Controls (Torch / Zoom / Camera Switch) */}
            {isScanning && !cameraError && (
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                {torchAvailable && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md transition ${
                      torchOn
                        ? 'bg-amber-400 text-gray-950 ring-2 ring-amber-300'
                        : 'bg-black/60 text-white hover:bg-black/80'
                    }`}
                    title="Encender/Apagar linterna"
                  >
                    {torchOn ? <Zap className="h-4 w-4 fill-current" /> : <ZapOff className="h-4 w-4" />}
                  </button>
                )}

                {zoomAvailable && (
                  <button
                    type="button"
                    onClick={toggleZoom}
                    className="h-8 px-2 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center gap-1 text-[11px] font-bold shadow-md transition"
                    title="Cambiar Zoom"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                    <span>{currentZoom}x</span>
                  </button>
                )}
              </div>
            )}

            {/* Live scanning tip */}
            {isScanning && !cameraError && (
              <div className="absolute bottom-2.5 inset-x-0 flex justify-center pointer-events-none px-4">
                <span className="bg-black/65 backdrop-blur-xs text-white text-[11px] font-medium px-3 py-1 rounded-full shadow-sm">
                  Centra el código de barras dentro del marco
                </span>
              </div>
            )}

            {/* Camera Error Message */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-900/95 text-white space-y-2.5">
                <AlertCircle className="h-9 w-9 text-amber-400" />
                <p className="text-xs font-medium text-gray-200">{cameraError}</p>
                <p className="text-[11px] text-gray-400 max-w-xs">
                  Puedes subir una foto del código de barras o escribirlo manualmente abajo.
                </p>
              </div>
            )}
          </div>

          {/* Camera Switcher (If multiple cameras detected) */}
          {cameras.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-gray-600 shrink-0 flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                <span>Cámara:</span>
              </label>
              <select
                id="camera-select"
                value={selectedCameraId}
                onChange={(e) => handleCameraSelect(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 focus:border-emerald-500 focus:outline-hidden"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Alternative Options: Upload photo & Manual Entry */}
          <div className="pt-2 border-t border-gray-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Otras opciones
              </span>
              <label className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition">
                <UploadCloud className="h-3.5 w-3.5" />
                <span>Escanear desde foto</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Manual Quick Entry */}
            <div className="flex gap-2">
              <input
                type="text"
                id="manual-scanner-code-input"
                placeholder="Escribe el código de barras aquí..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyManual()}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 focus:border-emerald-500 focus:outline-hidden"
              />
              <button
                type="button"
                id="apply-manual-code-button"
                onClick={handleApplyManual}
                disabled={!manualCode.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-4 py-2.5 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            id="close-scanner-modal-footer-button"
            onClick={() => {
              cleanupAll();
              onClose();
            }}
            className="rounded-xl bg-gray-200 hover:bg-gray-300 px-3.5 py-1.5 text-xs font-medium text-gray-700 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
