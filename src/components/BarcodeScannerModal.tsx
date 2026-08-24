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

/**
 * Verifica el dígito de control de EAN-8 / UPC-A / EAN-13.
 * Sirve para aceptar una lectura al instante cuando es matemáticamente
 * correcta, en vez de exigir confirmación por repetición (que es lo lento).
 */
const tieneChecksumValido = (code: string): boolean => {
  if (!/^\d+$/.test(code)) return false;
  if (code.length !== 8 && code.length !== 12 && code.length !== 13) return false;

  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  // De derecha a izquierda (sin el dígito de control): pesos 3,1,3,1…
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);

  return (10 - (sum % 10)) % 10 === check;
};

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
  const rafRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const doneRef = useRef(false);
  // Última lectura + cuántas veces seguidas se repitió (confirmación de códigos
  // sin checksum verificable, p. ej. CODE_128).
  const lastReadRef = useRef<{ code: string; hits: number }>({ code: '', hits: 0 });

  // El padre pasa `onScan`/`onClose` como funciones inline, así que cambian de
  // identidad en cada render suyo. Guardarlas en refs mantiene estables los
  // callbacks de abajo y evita que el efecto de arranque reinicie la cámara a
  // media lectura (reiniciarla borra el progreso del decodificador).
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  });

  const scannerContainerId = 'superfood-barcode-reader';

  // Handle successful detection
  const handleSuccess = useCallback((decodedText: string) => {
    const clean = decodedText.trim();
    if (!clean || doneRef.current) return;
    doneRef.current = true;

    playScanBeep();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch {
        /* ignore */
      }
    }

    cleanupAll();
    onScanRef.current(clean);
    onCloseRef.current();
  }, []);

  /**
   * Filtra la lectura cruda antes de darla por buena:
   * - checksum EAN/UPC válido → se acepta al instante (rápido y preciso).
   * - resto de formatos → se exige leer lo mismo 2 veces seguidas para no
   *   meter un código mal decodificado en el input.
   */
  const handleCandidate = useCallback(
    (raw: string) => {
      const clean = raw.trim();
      if (!clean || doneRef.current) return;

      if (tieneChecksumValido(clean)) {
        handleSuccess(clean);
        return;
      }

      const last = lastReadRef.current;
      const hits = last.code === clean ? last.hits + 1 : 1;
      lastReadRef.current = { code: clean, hits };
      if (hits >= 2) handleSuccess(clean);
    },
    [handleSuccess]
  );

  const cleanupAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastReadRef.current = { code: '', hits: 0 };

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
        const BD = window.BarcodeDetector;
        if (!BD) throw new Error('BarcodeDetector no disponible');

        // Solo pedimos los formatos que este navegador dice soportar: pasarle uno
        // desconocido al constructor hace que lance y perdamos el motor rápido.
        const soportados = await BD.getSupportedFormats();
        const formats = SUPPORTED_FORMATS_BARCODE_DETECTOR.filter((f) => soportados.includes(f));
        if (formats.length === 0) throw new Error('BarcodeDetector sin formatos útiles');

        const videoConstraints: MediaTrackConstraints = {
          facingMode: deviceId ? undefined : { ideal: 'environment' },
          deviceId: deviceId ? { exact: deviceId } : undefined,
          // 1280x720 decodifica un EAN-13 de sobra y llega a más fps que 1080p.
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
          // Enfoque continuo: sin esto la cámara se queda fija y las barras
          // salen borrosas justo a la distancia a la que uno acerca el producto.
          try {
            await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          } catch {
            /* la cámara no lo soporta */
          }
        }

        const video = videoRef.current;
        if (!video) throw new Error('El elemento <video> no está montado');

        video.srcObject = stream;
        await video.play();
        // Esperamos a que haya un fotograma real: detectar sobre un vídeo con
        // videoWidth 0 no devuelve nada nunca.
        if (video.videoWidth === 0) {
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener('loadeddata', onReady);
              resolve();
            };
            video.addEventListener('loadeddata', onReady);
            setTimeout(onReady, 3000);
          });
        }

        const detector = new BD({ formats });

        setScanningEngine('native');
        setIsScanning(true);

        // Bucle de detección atado a requestAnimationFrame: va tan rápido como
        // el dispositivo permita y no encola trabajo si un frame tarda.
        const tick = async () => {
          rafRef.current = requestAnimationFrame(tick);

          const v = videoRef.current;
          if (isProcessingRef.current || doneRef.current || !v || v.readyState < 2 || v.videoWidth === 0) {
            return;
          }

          isProcessingRef.current = true;
          try {
            const barcodes = await detector.detect(v);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              handleCandidate(barcodes[0].rawValue);
            }
          } catch {
            // Frame drop, ignore
          } finally {
            isProcessingRef.current = false;
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: unknown) {
        console.warn('[Scanner] Error with native scanner, trying Html5Qrcode fallback:', err);
        startHtml5Scanner(deviceId);
      }
    },
    // startHtml5Scanner se referencia por closure (se declara justo debajo y es
    // estable); añadirlo aquí crearía una dependencia circular entre callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cleanupAll, handleCandidate]
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
          // ZXing decodifica en JS puro: a 25 fps sobre 1080p no le da tiempo y
          // se pierden fotogramas enteros. 15 fps sobre 720p rinde bastante más.
          fps: 15,
          // Sin qrbox: se analiza el fotograma completo.
          //
          // qrbox recorta la imagen antes de decodificar, y para saber QUÉ píxeles
          // recortar html5-qrcode asume que el vídeo se muestra en modo "contain".
          // El vídeo estaba con `object-cover`, así que esa cuenta salía desplazada
          // y la librería terminaba analizando una zona distinta de la que se ve en
          // pantalla: por eso el código quedaba perfectamente encuadrado y aun así
          // no se detectaba nada. Analizando el fotograma entero el problema
          // desaparece y ya no depende del CSS.
          qrbox: undefined,
          aspectRatio: undefined,
          disableFlip: true,
          videoConstraints: {
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const cameraToUse = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' };

        await html5QrCode.start(
          cameraToUse,
          config,
          (decodedText) => {
            handleCandidate(decodedText);
          },
          () => {
            // Ignore scan frame misses
          }
        );

        // Enfoque continuo también en este motor (html5-qrcode crea su propio
        // stream, así que hay que pedirle el track al <video> que inserta).
        const innerVideo = document.querySelector<HTMLVideoElement>(`#${scannerContainerId} video`);
        const track = (innerVideo?.srcObject as MediaStream | null)?.getVideoTracks()?.[0];
        if (track) {
          if ('getCapabilities' in track) {
            const caps = (track.getCapabilities as () => MediaTrackCapabilities)();
            if ('torch' in caps) setTorchAvailable(true);
            if ('zoom' in caps) setZoomAvailable(true);
          }
          streamRef.current = (innerVideo!.srcObject as MediaStream);
          try {
            await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          } catch {
            /* la cámara no lo soporta */
          }
        }

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
    [cleanupAll, handleCandidate]
  );

  // Initialize camera and start scanner
  useEffect(() => {
    if (!isOpen) {
      cleanupAll();
      return;
    }

    setCameraError(null);
    setIsScanning(false);
    doneRef.current = false;
    lastReadRef.current = { code: '', hits: 0 };

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
            {/*
              Ambos contenedores se montan siempre y se oculta el que no se usa.
              Renderizar el <video> de forma condicional hacía que videoRef.current
              fuese null justo cuando el motor nativo le asignaba el stream, así
              que la cámara nunca llegaba a emitir un fotograma que analizar.
            */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`w-full h-full object-contain ${scanningEngine === 'native' ? '' : 'hidden'}`}
            />
            {/*
              object-contain (no object-cover): así se ve el fotograma completo,
              que es exactamente el que se analiza. Con object-cover los bordes
              quedaban recortados en pantalla y lo que se veía no coincidía con
              lo que la librería estaba leyendo.
            */}
            <div
              id={scannerContainerId}
              className={`w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-contain ${
                scanningEngine === 'native' ? 'hidden' : ''
              }`}
            />

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
                  Acerca el código hasta que llene el ancho y espera al enfoque
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
