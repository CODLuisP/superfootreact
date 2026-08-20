import React, { useState, useEffect, useRef } from 'react';
import { Product, User } from '../types';
import { api } from '../services/api';
import { BarcodeBadge } from './BarcodeBadge';
import { X, Save, Trash2, Upload, AlertCircle, Tag } from 'lucide-react';

interface ProductEditModalProps {
  product: Product | null;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: Product) => void;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DISALLOWED_EXTENSIONS = ['.ico'];

export const ProductEditModal: React.FC<ProductEditModalProps> = ({ product, isOpen, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [image, setImage] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setImage(product.image || '');
      setError(null);
    }
  }, [product, isOpen]);

  const handleImageFile = (file: File) => {
    const lower = file.name.toLowerCase();
    if (DISALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext)) || file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') {
      setError('Formato .ico no permitido. Usa JPG, PNG, WebP o GIF.');
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Formato no válido. Usa JPG, PNG, WebP o GIF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => { setImage(e.target?.result as string); setError(null); };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    if (!name.trim()) { setError('El nombre del producto es obligatorio.'); return; }
    setIsSaving(true);
    try {
      const updated = await api.updateProduct(product.code, {
        name: name.trim(),
        image: image || undefined,
        status: product.status,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div id="product-edit-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div id="product-edit-modal" className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 leading-none">Editar Producto</h3>
              <p className="text-xs text-gray-500 mt-1">Código: <span className="font-mono text-gray-700">{product.code}</span></p>
            </div>
          </div>
          <button id="close-edit-modal-button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Photo Edit */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">Fotografía</label>
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shrink-0 flex items-center justify-center">
                {image ? <img src={image} alt="Preview" className="h-full w-full object-cover" /> : <span className="text-xs text-gray-400">Sin foto</span>}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition inline-flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{image ? 'Cambiar imagen' : 'Subir imagen'}</span>
                  </button>
                  {image && (
                    <button type="button" onClick={() => setImage('')} className="rounded-lg bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 text-xs font-medium transition inline-flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">Formatos: JPG, PNG, WebP, GIF (no .ico)</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])} className="hidden" />
            </div>
          </div>

          {/* Barcode (readonly) and Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Código de barras</label>
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <BarcodeBadge code={product.code} />
                <span className="text-[10px] text-gray-400 ml-auto">no editable</span>
              </div>
            </div>

            <div>
              <label htmlFor="edit-name-input" className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Nombre del producto <span className="text-red-500">*</span>
              </label>
              <input id="edit-name-input" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-hidden" />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            <button type="button" id="cancel-edit-button" onClick={onClose} className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition">Cancelar</button>
            <button type="submit" id="save-edit-button" disabled={isSaving} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5">
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Guardando…' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
