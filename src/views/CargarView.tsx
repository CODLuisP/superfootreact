import React, { useState, useEffect, useRef } from 'react';
import { Product, User } from '../types';
import { playScanBeep } from '../services/storage';
import { api } from '../services/api';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { BarcodeImage } from '../components/BarcodeImage';
import confetti from 'canvas-confetti';
import {
  Upload,
  Camera,
  CheckCircle2,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Barcode,
  Tag,
  RotateCcw,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface CargarViewProps {
  currentUser: User;
  onProductSaved: (product: Product) => void;
  onNavigateToCatalog: () => void;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DISALLOWED_EXTENSIONS = ['.ico'];

export const CargarView: React.FC<CargarViewProps> = ({
  onProductSaved,
  onNavigateToCatalog,
}) => {
  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState<string>('');
  const [imageFileName, setImageFileName] = useState<string>('');
  const [status, setStatus] = useState<'aprobado' | 'pendiente'>('aprobado');

  // UI State
  const [isDragging, setIsDragging] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; name?: string; image?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{ show: boolean; name: string } | null>(null);

  // Verificación instantánea de duplicados
  const [checkingCode, setCheckingCode] = useState(false);
  const [existingProduct, setExistingProduct] = useState<Product | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verificación en vivo cada vez que se escribe o escanea un código
  useEffect(() => {
    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length < 3) {
      setExistingProduct(null);
      setCheckingCode(false);
      return;
    }

    setCheckingCode(true);
    const timer = setTimeout(async () => {
      try {
        const { items } = await api.getProductsPage({
          status: 'aprobado',
          buscar: cleanCode,
          limit: 1,
        });
        const match = (items || []).find((p) => String(p.code).trim() === cleanCode);
        if (match) {
          setExistingProduct(match);
        } else {
          const { items: pendings } = await api.getProductsPage({
            status: 'pendiente',
            buscar: cleanCode,
            limit: 1,
          });
          const pendMatch = (pendings || []).find((p) => String(p.code).trim() === cleanCode);
          setExistingProduct(pendMatch || null);
        }
      } catch {
        setExistingProduct(null);
      } finally {
        setCheckingCode(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [code]);

  // Global Paste Handler for Ctrl+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          if (item.type.includes('icon') || item.type.includes('ico')) {
            setErrors((prev) => ({ ...prev, image: 'El formato .ico no está permitido. Usa JPG, PNG, WebP o GIF.' }));
            return;
          }
          const blob = item.getAsFile();
          if (blob) processImageFile(blob);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // ── Lector físico de código de barras desde CUALQUIER parte del formulario ──
  // Un lector USB escribe carácter por carácter, muchísimo más rápido que una
  // persona (unos pocos ms entre teclas) y termina con Enter/Tab. Detectamos
  // ese patrón sin importar qué campo tenga el foco, y llenamos el código.
  useEffect(() => {
    const FAST_GAP_MS = 40; // brecha entre teclas típica de un lector (una persona no llega)
    const FINALIZE_GAP_MS = 120; // pausa tras la última tecla = fin de la lectura

    let buffer = '';
    let scanning = false;
    let lastTime = 0;
    let leakTargetId: string | null = null;
    let finalizeTimer: ReturnType<typeof setTimeout> | null = null;

    const pareceCodigo = (v: string) => {
      if (v.length < 6) return false;
      const digitos = (v.match(/[0-9]/g) || []).length;
      return digitos / v.length >= 0.6; // mayormente numérico, como casi todo código real
    };

    const finalizar = () => {
      if (finalizeTimer) { clearTimeout(finalizeTimer); finalizeTimer = null; }
      const valor = buffer;
      buffer = '';
      scanning = false;
      leakTargetId = null;
      if (pareceCodigo(valor)) {
        setCode(valor);
        setErrors((prev) => ({ ...prev, code: undefined }));
        playScanBeep();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isScannerOpen) return; // el modal de cámara maneja lo suyo
      const target = e.target as HTMLElement | null;
      if (target && target.id === 'barcode-input') return; // ahí ya funciona escribiendo normal

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (scanning) { e.preventDefault(); finalizar(); }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return; // solo caracteres imprimibles

      const now = performance.now();
      const gap = now - lastTime;
      lastTime = now;

      if (gap > FAST_GAP_MS) {
        // Podría ser el inicio de una lectura (aún no lo sabemos) o tecleo humano normal.
        buffer = e.key;
        scanning = false;
        leakTargetId = target?.id ?? null;
      } else {
        // Llega demasiado rápido para ser una persona: es un lector.
        buffer += e.key;
        if (!scanning) {
          scanning = true;
          // El primer carácter ya se filtró al campo enfocado: lo quitamos.
          if (leakTargetId === 'product-name-input') {
            setName((prev) => prev.slice(0, -1));
          }
        }
        e.preventDefault(); // de aquí en más, no dejamos que se siga escribiendo donde estaba el foco
      }

      if (finalizeTimer) clearTimeout(finalizeTimer);
      finalizeTimer = setTimeout(() => { if (scanning) finalizar(); }, FINALIZE_GAP_MS);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (finalizeTimer) clearTimeout(finalizeTimer);
    };
  }, [isScannerOpen]);

  const processImageFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (
      DISALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) ||
      file.type === 'image/x-icon' ||
      file.type === 'image/vnd.microsoft.icon'
    ) {
      setErrors((prev) => ({ ...prev, image: 'El formato .ico no está permitido. Usa JPG, PNG, WebP o GIF.' }));
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrors((prev) => ({ ...prev, image: 'Formato no soportado. Formatos permitidos: JPG, PNG, WebP o GIF.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setImageFileName(file.name);
      setErrors((prev) => ({ ...prev, image: undefined }));
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) processImageFile(e.dataTransfer.files[0]);
  };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) processImageFile(e.target.files[0]);
  };

  const handleScanCode = (scannedCode: string) => {
    setCode(scannedCode);
    setErrors((prev) => ({ ...prev, code: undefined }));
    playScanBeep();
  };

  const handleClear = () => {
    setCode('');
    setName('');
    setImage('');
    setImageFileName('');
    setStatus('aprobado');
    setErrors({});
    setSubmitError(null);
  };

  const validateForm = (): boolean => {
    const newErrors: { code?: string; name?: string } = {};
    if (!code.trim()) newErrors.code = 'El código de barras es obligatorio.';
    if (!name.trim()) newErrors.name = 'El nombre del producto es obligatorio.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validateForm() || isSaving) return;

    if (existingProduct) {
      setSubmitError(`El código "${code.trim()}" ya está registrado como "${existingProduct.name}". No es posible duplicarlo.`);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await api.createProduct({
        code: code.trim(),
        name: name.trim(),
        image: image || undefined,
        status,
      });

      try {
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 }, colors: ['#10b981', '#059669', '#34d399', '#f59e0b'] });
      } catch { /* ignore */ }

      setSuccessToast({ show: true, name: saved.name });
      onProductSaved(saved);
      handleClear();
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } catch (err) {
      setSubmitError((err as Error).message || 'No se pudo guardar el producto.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">Cargar producto</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Sube la foto, escanea o escribe el código y el nombre para registrarlo en el catálogo.
        </p>
      </div>

      {/* Success Notification Toast */}
      {successToast?.show && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-900">¡Producto guardado exitosamente!</p>
              <p className="text-[11px] text-emerald-700">&ldquo;{successToast.name}&rdquo; ya se encuentra registrado.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onNavigateToCatalog} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold px-2.5 py-1.5 transition">Ver en Catálogo</button>
            <button type="button" onClick={() => setSuccessToast(null)} className="text-xs text-emerald-700 hover:text-emerald-900 p-1">✕</button>
          </div>
        </div>
      )}

      {/* Main Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-5 sm:p-6 space-y-4">
        {submitError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Section 1: Product Photo Dropzone */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Fotografía del Producto{' '}
            <span className="text-gray-400 font-normal normal-case">(Opcional)</span>
          </label>

          <div
            id="product-image-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !image && fileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed transition-all duration-150 cursor-pointer overflow-hidden ${
              isDragging ? 'border-emerald-500 bg-emerald-50/70' : image ? 'border-gray-200 bg-gray-50/50' : 'border-gray-300 hover:border-emerald-500 hover:bg-gray-50/60'
            }`}
          >
            {image ? (
              <div className="p-2.5 flex items-center gap-3.5">
                <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-white border border-gray-200 shadow-2xs shrink-0 p-1 flex items-center justify-center">
                  <img src={image} alt="Vista previa del producto" className="h-full w-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Imagen cargada</span>
                  </div>
                  <p className="text-xs text-gray-700 font-medium truncate mt-0.5">{imageFileName || 'Imagen del producto'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="rounded-md bg-gray-200 hover:bg-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-700 transition">Cambiar</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setImage(''); setImageFileName(''); }} className="rounded-md bg-red-50 hover:bg-red-100 text-red-600 px-2 py-0.5 text-[11px] font-medium transition inline-flex items-center gap-1">
                      <Trash2 className="h-3 w-3" />
                      <span>Quitar</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 px-4 text-center flex flex-col sm:flex-row items-center justify-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Upload className="h-4 w-4" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xs font-semibold text-gray-800">
                    Arrastra la imagen aquí, o <span className="text-emerald-600 underline">haz clic para explorar</span>
                    <span className="text-gray-400 font-normal text-[11px] ml-1.5">(o presiona <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono text-gray-600">Ctrl + V</kbd>)</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WebP, GIF (sin .ico)</p>
                </div>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileInputChange} className="hidden" />
          </div>

          {errors.image && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>{errors.image}</span>
            </p>
          )}
        </div>

        {/* Section 2: Barcode & Product Name (Required) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Código de barras */}
          <div>
            <label htmlFor="barcode-input" className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Código de barras <span className="text-red-500">*</span>
            </label>

            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Barcode className="h-3.5 w-3.5" />
                </div>
                <input
                  ref={barcodeInputRef}
                  id="barcode-input"
                  type="text"
                  required
                  placeholder="ej. 7750123456789"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); if (errors.code) setErrors((prev) => ({ ...prev, code: undefined })); }}
                  className={`w-full rounded-xl border ${
                    existingProduct
                      ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-100'
                      : errors.code
                      ? 'border-red-300 ring-2 ring-red-100'
                      : 'border-gray-300'
                  } pl-9 pr-3 py-2 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition`}
                />
              </div>

              <button type="button" id="scan-camera-button" onClick={() => setIsScannerOpen(true)} className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-semibold shadow-2xs transition shrink-0" title="Escanear con la cámara">
                <Camera className="h-3.5 w-3.5 text-emerald-400" />
                <span>Escanear</span>
              </button>
            </div>

            {/* Estado de comprobación en vivo */}
            {checkingCode && (
              <p className="mt-1 text-[11px] text-gray-500 flex items-center gap-1 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                <span>Comprobando código en el catálogo…</span>
              </p>
            )}

            {!checkingCode && existingProduct && (
              <div className="mt-2 rounded-xl bg-amber-50 border border-amber-300 p-2.5 flex items-center justify-between gap-2.5 text-xs animate-in fade-in">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-white border border-amber-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs p-0.5">
                    {existingProduct.image ? (
                      <img src={existingProduct.image} alt={existingProduct.name} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[8px] text-amber-700 font-bold">Sin foto</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-amber-900 leading-tight flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>¡Este código ya está registrado!</span>
                    </p>
                    <p className="text-xs text-gray-800 font-semibold truncate mt-0.5" title={existingProduct.name}>
                      {existingProduct.name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToCatalog}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-2xs transition"
                >
                  <span>Ver en catálogo</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}

            {!checkingCode && !existingProduct && code.trim().length >= 6 && (
              <p className="mt-1 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Código disponible para nuevo registro</span>
              </p>
            )}

            {errors.code && (
              <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.code}</span>
              </p>
            )}
          </div>

          {/* Nombre del producto */}
          <div>
            <label htmlFor="product-name-input" className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1">
              Nombre del producto <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Tag className="h-3.5 w-3.5" />
              </div>
              <input
                id="product-name-input"
                type="text"
                required
                placeholder="ej. Quinoa Real Orgánica 500g"
                value={name}
                onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((prev) => ({ ...prev, name: undefined })); }}
                className={`w-full rounded-xl border ${errors.name ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-300'} pl-9 pr-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition`}
              />
            </div>
            {errors.name && (
              <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>{errors.name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Vista previa del código de barras generado */}
        {code.trim() && (
          <div className="flex justify-center pt-0.5">
            <BarcodeImage value={code.trim()} height={38} />
          </div>
        )}

        {/* Section 3: Status selector */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gray-50/80 rounded-xl border border-gray-200/70 text-xs">
          <span className="font-semibold text-gray-700 text-xs">Estado de carga:</span>
          <div className="flex items-center gap-2">
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs transition ${status === 'aprobado' ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <input type="radio" name="productStatus" value="aprobado" checked={status === 'aprobado'} onChange={() => setStatus('aprobado')} className="text-emerald-600 focus:ring-emerald-500" />
              <span>Catálogo Directo (Aprobado)</span>
            </label>
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs transition ${status === 'pendiente' ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <input type="radio" name="productStatus" value="pendiente" checked={status === 'pendiente'} onChange={() => setStatus('pendiente')} className="text-amber-600 focus:ring-amber-500" />
              <span>Pendiente de Revisión</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2.5">
          <button type="button" id="clear-form-button" onClick={handleClear} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 text-xs font-semibold transition">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpiar</span>
          </button>

          <button type="submit" id="save-product-button" disabled={isSaving} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-6 py-2 text-xs font-bold shadow-md shadow-emerald-600/25 active:scale-98 transition">
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSaving ? 'Guardando…' : 'Guardar producto'}</span>
          </button>
        </div>
      </form>

      {/* Barcode Camera Scanner Modal */}
      <BarcodeScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleScanCode} />
    </div>
  );
};
