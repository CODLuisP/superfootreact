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
  Sparkles,
  Barcode,
  Tag,
  RotateCcw,
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

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
      
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Cargar producto</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1 max-w-2xl">
          Sube la foto, escanea o escribe el código y el nombre. Se guarda en el catálogo.
        </p>
      </div>

      {/* Success Notification Toast */}
      {successToast?.show && (
        <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">¡Producto guardado exitosamente!</p>
              <p className="text-xs text-emerald-700">&ldquo;{successToast.name}&rdquo; ya se encuentra registrado en el catálogo.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onNavigateToCatalog} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 transition">Ver en Catálogo</button>
            <button type="button" onClick={() => setSuccessToast(null)} className="text-xs text-emerald-700 hover:text-emerald-900 p-1.5">✕</button>
          </div>
        </div>
      )}

      {/* Main Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-md shadow-gray-200/60 border border-gray-200/80 p-6 sm:p-8 space-y-7">
        {submitError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Section 1: Product Photo Dropzone */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
            Fotografía del Producto{' '}
            <span className="text-gray-400 font-normal normal-case">(Opcional / Recomendado)</span>
          </label>

          <div
            id="product-image-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !image && fileInputRef.current?.click()}
            className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden ${
              isDragging ? 'border-emerald-500 bg-emerald-50/70 scale-[1.01]' : image ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-emerald-500 hover:bg-gray-50/80'
            }`}
          >
            {image ? (
              <div className="p-4 flex flex-col sm:flex-row items-center gap-5">
                <div className="relative h-40 w-40 sm:h-36 sm:w-36 rounded-xl overflow-hidden bg-white border border-gray-200 shadow-xs shrink-0">
                  <img src={image} alt="Vista previa del producto" className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Imagen cargada</span>
                  </div>
                  <p className="text-xs text-gray-600 truncate max-w-sm">{imageFileName || 'Imagen del producto cargada'}</p>
                  <p className="text-[11px] text-gray-400">Formatos soportados: JPG, PNG, WebP, GIF (sin .ico)</p>
                  <div className="flex items-center gap-2 pt-1 justify-center sm:justify-start">
                    <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="rounded-lg bg-gray-200 hover:bg-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition">Cambiar foto</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setImage(''); setImageFileName(''); }} className="rounded-lg bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 text-xs font-medium transition inline-flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Quitar</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 sm:p-10 text-center flex flex-col items-center justify-center">
                <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 shadow-2xs">
                  <Upload className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  Arrastra y suelta la imagen aquí, o <span className="text-emerald-600 underline">haz clic para explorar</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  También puedes presionar <kbd className="px-1.5 py-0.5 bg-gray-200 rounded font-mono text-[10px] text-gray-700">Ctrl + V</kbd> para pegar desde el portapapeles
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="bg-gray-100 px-2 py-0.5 rounded">JPG</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded">PNG</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded">WebP</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded">GIF</span>
                  <span className="text-red-400">(no .ico)</span>
                </div>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileInputChange} className="hidden" />
          </div>

          {errors.image && (
            <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{errors.image}</span>
            </p>
          )}
        </div>

        {/* Section 2: Barcode & Product Name (Required) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Código de barras */}
          <div>
            <label htmlFor="barcode-input" className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-1.5">
              Código de barras <span className="text-red-500">*</span>
            </label>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <Barcode className="h-4 w-4" />
                </div>
                <input
                  ref={barcodeInputRef}
                  id="barcode-input"
                  type="text"
                  required
                  placeholder="ej. 7750123456789"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); if (errors.code) setErrors((prev) => ({ ...prev, code: undefined })); }}
                  className={`w-full rounded-xl border ${errors.code ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-300'} pl-10 pr-3 py-2.5 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition`}
                />
              </div>

              <button type="button" id="scan-camera-button" onClick={() => setIsScannerOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-semibold shadow-2xs hover:scale-[1.02] active:scale-98 transition shrink-0">
                <Camera className="h-4 w-4 text-emerald-400" />
                <span>Escanear</span>
              </button>
            </div>

            {errors.code && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{errors.code}</span>
              </p>
            )}
          </div>

          {/* Nombre del producto */}
          <div>
            <label htmlFor="product-name-input" className="block text-xs font-bold uppercase tracking-wider text-gray-800 mb-1.5">
              Nombre del producto <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                <Tag className="h-4 w-4" />
              </div>
              <input
                id="product-name-input"
                type="text"
                required
                placeholder="ej. Quinoa Real Orgánica 500g"
                value={name}
                onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((prev) => ({ ...prev, name: undefined })); }}
                className={`w-full rounded-xl border ${errors.name ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-300'} pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition`}
              />
            </div>
            {errors.name && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{errors.name}</span>
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-gray-400">Incluye marca, tipo y gramaje/volumen para fácil identificación.</p>
          </div>
        </div>

        {/* Vista previa del código de barras generado */}
        {code.trim() && (
          <div className="flex justify-center">
            <BarcodeImage value={code.trim()} />
          </div>
        )}

        {/* Section 3: Status selector */}
        <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200/70">
          <span className="text-xs font-semibold text-gray-700">Estado de carga:</span>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-800 cursor-pointer">
              <input type="radio" name="productStatus" value="aprobado" checked={status === 'aprobado'} onChange={() => setStatus('aprobado')} className="text-emerald-600 focus:ring-emerald-500" />
              <span className="font-medium text-emerald-800">Catálogo Directo (Aprobado)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-800 cursor-pointer">
              <input type="radio" name="productStatus" value="pendiente" checked={status === 'pendiente'} onChange={() => setStatus('pendiente')} className="text-amber-600 focus:ring-amber-500" />
              <span className="font-medium text-amber-800">Guardar como Pendiente de Revisión</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button type="button" id="clear-form-button" onClick={handleClear} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2.5 text-xs font-semibold transition">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpiar</span>
          </button>

          <button type="submit" id="save-product-button" disabled={isSaving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-7 py-2.5 text-xs font-bold shadow-md shadow-emerald-600/25 hover:scale-[1.01] active:scale-98 transition">
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
