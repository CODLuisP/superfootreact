import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, UploadCloud, AlertCircle } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { playScanBeep } from '../services/storage';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'superfood-barcode-reader';

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    setCameraError(null);
    setIsScanning(false);

    // Enumerate cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          const list = devices.map((d) => ({
            id: d.id,
            label: d.label || `Cámara ${d.id.slice(0, 5)}`,
          }));
          setCameras(list);
          // Prefer back/environment camera if available
          const backCam = devices.find(
            (d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('trasera') ||
              d.label.toLowerCase().includes('environment')
          );
          const defaultCamId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(defaultCamId);
          startScanner(defaultCamId);
        } else {
          setCameraError(
            'No se detectó ninguna cámara disponible en tu dispositivo. Puedes usar un lector USB o escribir el código.'
          );
        }
      })
      .catch((err) => {
        console.warn('Camera permission or availability error:', err);
        setCameraError(
          'Permiso de cámara denegado o no disponible en este entorno. Puedes usar el simulador de prueba o ingresar el código.'
        );
      });

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async (cameraId: string) => {
    try {
      if (html5QrCodeRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 260, height: 180 },
        aspectRatio: 1.3333,
      };

      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
          // Success
          playScanBeep();
          stopScanner();
          onScan(decodedText);
          onClose();
        },
        () => {
          // Ignore scanning frame errors
        }
      );

      setIsScanning(true);
      setCameraError(null);
    } catch (err: unknown) {
      console.warn('Error starting camera barcode scanner:', err);
      setCameraError(
        'No se pudo inicializar la transmisión de video. Puedes ingresar el código manualmente o seleccionar un ejemplo.'
      );
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        html5QrCodeRef.current = null;
        setIsScanning(false);
      }
    }
  };

  const handleCameraChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (newId) {
      await startScanner(newId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('temp-file-scanner');
      const result = await html5QrCode.scanFile(file, true);
      playScanBeep();
      onScan(result);
      onClose();
    } catch (err) {
      alert('No se detectó un código de barras claro en la imagen subida.');
      console.error(err);
    }
  };

  const handleApplyManual = () => {
    if (!manualCode.trim()) return;
    playScanBeep();
    onScan(manualCode.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      id="barcode-scanner-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="barcode-scanner-modal"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 leading-none">
                Escanear Código de Barras
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Apunta la cámara al código EAN-13, UPC o QR
              </p>
            </div>
          </div>
          <button
            id="close-scanner-button"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Camera Viewport Area */}
          <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-4/3 flex flex-col items-center justify-center border border-gray-200 shadow-inner">
            <div
              id={scannerContainerId}
              className="w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
            />
            <div id="temp-file-scanner" className="hidden" />

            {/* Target reticle & laser animation */}
            {isScanning && !cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-36 border-2 border-emerald-400 rounded-lg shadow-lg">
                  {/* Corner accents */}
                  <span className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-emerald-500 rounded-tl" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-emerald-500 rounded-tr" />
                  <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-emerald-500 rounded-bl" />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-emerald-500 rounded-br" />

                  {/* Animated laser line */}
                  <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse relative top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {/* Camera Error / Fallback message */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-900/90 text-white space-y-3">
                <AlertCircle className="h-10 w-10 text-amber-400" />
                <p className="text-sm font-medium text-gray-200">{cameraError}</p>
                <p className="text-xs text-gray-400 max-w-xs">
                  Puedes cargar una imagen con el código de barras o escribirlo manualmente abajo.
                </p>
              </div>
            )}
          </div>

          {/* Camera controls */}
          {cameras.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 shrink-0">
                Seleccionar cámara:
              </label>
              <select
                id="camera-select"
                value={selectedCameraId}
                onChange={handleCameraChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-emerald-500 focus:outline-hidden"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Secondary Options: File Scan & Test Samples */}
          <div className="pt-2 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Opciones alternativas
              </span>
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition">
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
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                id="manual-scanner-code-input"
                placeholder="Escribe aquí el código de barras..."
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
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            id="close-scanner-modal-footer-button"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="rounded-xl bg-gray-200 hover:bg-gray-300 px-4 py-2 text-xs font-medium text-gray-700 transition"
          >
            Cerrar escáner
          </button>
        </div>
      </div>
    </div>
  );
};
