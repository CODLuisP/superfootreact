import React, { useState, useEffect, useRef } from 'react';
import { Product, User } from '../types';
import { api } from '../services/api';
import { BarcodeImage } from './BarcodeImage';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { X, Save, Trash2, Upload, AlertCircle, Barcode, Tag, Camera, CheckCircle2 } from 'lucide-react';

interface ProductEditModalProps {
  product: Product | null;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: Product) => void;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DISALLOWED_EXTENSIONS = ['.ico'];

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
  product,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState<string>('');
  const [imageFileName, setImageFileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setCode(product.code || '');
      setName(product.name || '');
      setImage(product.image || '');
      setImageFileName('');
      setError(null);
    }
  }, [product, isOpen]);

  const handleImageFile = (file: File) => {
    const lower = file.name.toLowerCase();
    if (
      DISALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
      file.type === 'image/x-icon' ||
      file.type === 'image/vnd.microsoft.icon'
    ) {
      setError('Formato .ico no permitido. Usa JPG, PNG, WebP o GIF.');
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Formato no válido. Usa JPG, PNG, WebP o GIF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setImageFileName(file.name || 'imagen-pegada.png');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // Listener para pegar imagen con Ctrl + V mientras el modal esté abierto
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            handleImageFile(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    if (!code.trim()) {
      setError('El código de barras es obligatorio.');
      return;
    }
    if (!name.trim()) {
      setError('El nombre del producto es obligatorio.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.updateProduct(product.code, {
        code: code.trim(),
        name: name.trim(),
        image: image || undefined,
        status: product.status,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'No se pudo actualizar el producto.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div
      id="product-edit-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="product-edit-modal"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/90 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900 leading-none">Editar Producto</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Modifica los datos y fotografía del catálogo</p>
            </div>
          </div>
          <button
            id="close-edit-modal-button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Photo Section */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Fotografía del Producto
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) handleImageFile(e.dataTransfer.files[0]);
              }}
              className={`flex items-center gap-3.5 p-3 rounded-xl border-2 transition-all ${
                isDragging ? 'border-emerald-500 bg-emerald-50/70' : 'border-gray-200 bg-gray-50/60'
              }`}
            >
              <div className="relative h-20 w-20 rounded-lg border border-gray-200 overflow-hidden bg-white shrink-0 flex items-center justify-center shadow-2xs p-1">
                {image ? (
                  <img src={image} alt="Vista previa" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-gray-400 font-medium">Sin foto</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-white border border-gray-300 hover:bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 transition inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Upload className="h-3.5 w-3.5 text-gray-500" />
                    <span>{image ? 'Cambiar imagen' : 'Subir imagen'}</span>
                  </button>
                  {image && (
                    <button
                      type="button"
                      onClick={() => { setImage(''); setImageFileName(''); }}
                      className="rounded-lg bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 text-xs font-semibold transition inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1 truncate">
                  {imageFileName ? (
                    <span className="font-medium text-emerald-700">{imageFileName}</span>
                  ) : (
                    <span>
                      Arrastra, explora o pega con <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[9px] font-mono text-gray-700 shadow-2xs">Ctrl + V</kbd>
                    </span>
                  )}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
                className="hidden"
              />
            </div>
          </div>

          {/* Form Fields: Editable Barcode & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Código de barras (Editable) */}
            <div>
              <label
                htmlFor="edit-barcode-input"
                className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1"
              >
                Código de barras <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <Barcode className="h-3.5 w-3.5" />
                  </div>
                  <input
                    id="edit-barcode-input"
                    type="text"
                    required
                    placeholder="ej. 7750123456789"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-semibold shadow-2xs transition shrink-0"
                  title="Escanear con cámara"
                >
                  <Camera className="h-3.5 w-3.5 text-emerald-400" />
                </button>
              </div>
            </div>

            {/* Nombre del producto */}
            <div>
              <label
                htmlFor="edit-name-input"
                className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-1"
              >
                Nombre del producto <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Tag className="h-3.5 w-3.5" />
                </div>
                <input
                  id="edit-name-input"
                  type="text"
                  required
                  placeholder="ej. Quinoa Real 500g"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
                />
              </div>
            </div>
          </div>

          {/* Barcode Image SVG Live Preview */}
          {code.trim() && (
            <div className="flex justify-center pt-1">
              <BarcodeImage value={code.trim()} height={36} />
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              id="cancel-edit-button"
              onClick={onClose}
              className="rounded-xl bg-gray-100 hover:bg-gray-200 px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-edit-button"
              disabled={isSaving}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-98 transition inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Guardando…' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Barcode Scanner Modal for re-scanning in edit mode */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(scanned) => setCode(scanned)}
      />
    </div>
  );
};
