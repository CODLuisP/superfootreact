import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Product, User } from '../types';
import { playScanBeep } from '../services/storage';
import { api } from '../services/api';
import { BarcodeBadge } from '../components/BarcodeBadge';
import { ProductEditModal } from '../components/ProductEditModal';
import { Pagination } from '../components/Pagination';
import {
  AlertTriangle, CheckCircle2, Image as ImageIcon, Edit2, Trash2, UploadCloud, CheckCheck, PackageCheck, Clock, Sparkles, Search,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface PendientesViewProps {
  currentUser: User;
  onCountsChange: () => void;
  onNavigateToCargar: () => void;
}

const PAGE_SIZE = 24;

export const PendientesView: React.FC<PendientesViewProps> = ({ currentUser, onCountsChange, onNavigateToCargar }) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [onlySinImagen, setOnlySinImagen] = useState(false);

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [aprobandoTodo, setAprobandoTodo] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearchTerm(searchInput.trim()); setPage(0); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const cargarPagina = useCallback(async () => {
    setLoading(true);
    try {
      const { items: pageItems, total: pageTotal } = await api.getProductsPage({
        status: 'pendiente',
        buscar: searchTerm || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(pageItems);
      setTotal(pageTotal);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page]);

  useEffect(() => { cargarPagina(); }, [cargarPagina]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibles = onlySinImagen ? items.filter((p) => !p.image) : items;

  const handleApprove = async (product: Product) => {
    setBusyCode(product.code);
    try {
      await api.approve(product.code);
      playScanBeep();
      try { confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } }); } catch { /* ignore */ }
      await cargarPagina();
      onCountsChange();
    } finally { setBusyCode(null); }
  };

  const handleApproveAllOnPage = async () => {
    if (!window.confirm(`¿Aprobar los ${visibles.length} productos de esta página?`)) return;
    setAprobandoTodo(true);
    try {
      for (const p of visibles) await api.approve(p.code);
      playScanBeep();
      try { confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } }); } catch { /* ignore */ }
      await cargarPagina();
      onCountsChange();
    } finally { setAprobandoTodo(false); }
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm('¿Descartar este producto pendiente?')) return;
    await api.deleteProduct(product.code, 'pendiente');
    if (items.length === 1 && page > 0) setPage((p) => p - 1);
    else await cargarPagina();
    onCountsChange();
  };

  const handleQuickImageUpload = (product: Product, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      await api.updateProduct(product.code, { name: product.name, image: dataUrl, status: 'pendiente' });
      cargarPagina();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-[10px] uppercase tracking-wider mb-0.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Revisión de Calidad</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">Productos Pendientes</h1>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString('es')} en cola de revisión.</p>
        </div>

        {visibles.length > 0 && (
          <button type="button" disabled={aprobandoTodo} onClick={handleApproveAllOnPage} className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition">
            <CheckCheck className="h-3.5 w-3.5" />
            <span>Aprobar los {visibles.length} de esta página</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Search className="h-3.5 w-3.5" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre o código…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-xl border border-gray-300 pl-9 pr-4 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlySinImagen((v) => !v)}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition inline-flex items-center gap-1.5 ${onlySinImagen ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Solo sin imagen (esta página)</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2.5 pt-2 border-t border-gray-100">
          <div className="text-[11px] text-gray-500">
            {loading ? (
              <span className="text-gray-400">Cargando pendientes…</span>
            ) : (
              <span>
                Mostrando <strong className="text-gray-800">{visibles.length ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + visibles.length}</strong> de <strong className="text-gray-800">{total.toLocaleString('es')}</strong> pendientes
              </span>
            )}
          </div>

          {/* Paginación Superior Rápida */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
                title="Página anterior"
              >
                <ChevronLeft className="h-3 w-3" />
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-1 text-[11px] text-gray-600 px-1 font-medium">
                <span>Pág.</span>
                <span className="font-bold text-gray-900">{page + 1}</span>
                <span>/</span>
                <span className="font-bold text-gray-900">{totalPages.toLocaleString('es')}</span>
              </div>

              <button
                type="button"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
                title="Página siguiente"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {!loading && visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-xs">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5"><PackageCheck className="h-7 w-7" /></div>
          <h3 className="text-sm font-bold text-gray-900">{total === 0 ? '¡Excelente! No hay productos pendientes' : 'Sin resultados en esta página'}</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            {total === 0 ? 'Todos los productos han sido verificados y aprobados.' : 'Prueba otra búsqueda o quita el filtro.'}
          </p>
          {total === 0 && (
            <button type="button" onClick={onNavigateToCargar} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 shadow-md shadow-emerald-600/20 transition">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Cargar un nuevo producto</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map((p) => {
            const hasNoImage = !p.image;
            const hasUnverifiedCode = p.code.toUpperCase().includes('PEND') || p.code.length < 5;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-amber-200/80 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="bg-amber-50/80 px-3.5 py-2 border-b border-amber-200/60 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      {hasNoImage && hasUnverifiedCode ? 'Falta foto y verificar código' : hasNoImage ? 'Falta fotografía' : 'Código sin verificar'}
                    </span>
                    <span className="text-[9px] font-bold text-amber-700 uppercase bg-amber-100 px-1.5 py-0.5 rounded">Pendiente</span>
                  </div>

                  <div className="p-3.5 space-y-2.5">
                    <div className="flex gap-3">
                      <div className="relative h-16 w-16 rounded-lg bg-gray-50 border border-dashed border-gray-300 overflow-hidden flex items-center justify-center shrink-0 group">
                        {p.image ? (
                          <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <label className="cursor-pointer flex flex-col items-center justify-center p-1 text-center text-[9px] text-gray-400 group-hover:text-emerald-700">
                            <UploadCloud className="h-4 w-4 mb-0.5" />
                            <span>Subir foto</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && handleQuickImageUpload(p, e.target.files[0])} className="hidden" />
                          </label>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-xs leading-snug line-clamp-2">{p.name}</h3>
                        <div className="mt-1.5"><BarcodeBadge code={p.code} /></div>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-gray-600 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Registrado por:</span>
                        <span className="font-semibold text-gray-700">{p.createdBy || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Fecha:</span>
                        <span>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3.5 py-2 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => handleDelete(p)} className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Descartar"><Trash2 className="h-3.5 w-3.5" /></button>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setEditingProduct(p)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 shadow-2xs transition">
                      <Edit2 className="h-3 w-3" />
                      <span>Completar</span>
                    </button>
                    <button type="button" disabled={busyCode === p.code} onClick={() => handleApprove(p)} className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[11px] font-bold shadow-md shadow-emerald-600/20 transition">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Aprobar</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <Pagination page={page} totalPages={totalPages} loading={loading} onPageChange={setPage} />
      )}

      <ProductEditModal
        product={editingProduct}
        currentUser={currentUser}
        isOpen={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
        onSaved={() => { cargarPagina(); setEditingProduct(null); onCountsChange(); }}
      />
    </div>
  );
};
