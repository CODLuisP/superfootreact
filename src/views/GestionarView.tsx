import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Product, User } from '../types';
import { api } from '../services/api';
import { BarcodeBadge } from '../components/BarcodeBadge';
import { ProductEditModal } from '../components/ProductEditModal';
import {
  Search, Grid, List, Edit2, Trash2, FileText, FileSpreadsheet, FileType, CheckCircle2, Plus, PackageX, Upload, Loader2,
} from 'lucide-react';

const ImportarExcelModal = React.lazy(() =>
  import('../components/ImportarExcelModal').then((m) => ({ default: m.ImportarExcelModal }))
);

interface GestionarViewProps {
  currentUser: User;
  onCountsChange: () => void;
  onNavigateToCargar: () => void;
}

const BATCH_SIZE = 40;

export const GestionarView: React.FC<GestionarViewProps> = ({ currentUser, onCountsChange, onNavigateToCargar }) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  // Cargar primera página (reemplaza lista)
  const cargarInicial = useCallback(async () => {
    setInitialLoading(true);
    setLoadError(null);
    try {
      const { items: newItems, total: newTotal } = await api.getProductsPage({
        status: 'aprobado',
        buscar: searchTerm || undefined,
        limit: BATCH_SIZE,
        offset: 0,
      });
      setItems(newItems);
      setTotal(newTotal);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    } catch (err) {
      setLoadError((err as Error).message || 'No se pudo cargar el catálogo.');
    } finally {
      setInitialLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    cargarInicial();
  }, [cargarInicial]);

  // Cargar siguiente lote al hacer scroll interno
  const cargarMas = useCallback(async () => {
    if (loadingMoreRef.current || initialLoading) return;
    if (items.length >= total) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const { items: newItems, total: newTotal } = await api.getProductsPage({
        status: 'aprobado',
        buscar: searchTerm || undefined,
        limit: BATCH_SIZE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...newItems]);
      setTotal(newTotal);
    } catch (err) {
      console.error('Error al cargar más productos:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [items.length, total, initialLoading, searchTerm]);

  // Listener de scroll interno en la tabla/grilla
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 250) {
      cargarMas();
    }
  };

  const handleDelete = async (product: Product) => {
    await api.deleteProduct(product.code, 'aprobado');
    setProductToDelete(null);
    setItems((prev) => prev.filter((p) => p.code !== product.code));
    setTotal((prev) => Math.max(0, prev - 1));
    onCountsChange();
  };

  const [exportando, setExportando] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async (formato: 'csv' | 'excel' | 'pdf') => {
    setExportando(formato);
    setExportMsg(null);
    try {
      const mod = await import('../utils/exportCatalogo');
      const fn = formato === 'csv' ? mod.exportarCSV : formato === 'excel' ? mod.exportarExcel : mod.exportarPDF;
      const n = await fn(searchTerm || undefined);
      setExportMsg(`✓ ${n.toLocaleString('es')} producto(s) exportado(s) a ${formato.toUpperCase()}.`);
    } catch (err) {
      setExportMsg(`No se pudo exportar: ${(err as Error).message}`);
    } finally {
      setExportando(null);
      setTimeout(() => setExportMsg(null), 5000);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 flex flex-col h-[calc(100vh-4.25rem)] overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-2.5 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">Gestionar Catálogo</h1>
          <p className="text-[11px] text-gray-500">
            {total.toLocaleString('es')} producto{total === 1 ? '' : 's'} en total. Busca, edita o elimina.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="inline-flex shrink-0 rounded-xl border border-gray-300 bg-white shadow-2xs overflow-hidden divide-x divide-gray-200">
            <button
              type="button"
              disabled={exportando !== null}
              onClick={() => handleExport('csv')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition whitespace-nowrap"
              title="Exportar CSV"
            >
              <FileText className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span>{exportando === 'csv' ? 'Exportando…' : 'CSV'}</span>
            </button>
            <button
              type="button"
              disabled={exportando !== null}
              onClick={() => handleExport('excel')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition whitespace-nowrap"
              title="Exportar Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{exportando === 'excel' ? 'Exportando…' : 'Excel'}</span>
            </button>
            <button
              type="button"
              disabled={exportando !== null}
              onClick={() => handleExport('pdf')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition whitespace-nowrap"
              title="Exportar PDF"
            >
              <FileType className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <span>{exportando === 'pdf' ? 'Exportando…' : 'PDF'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition whitespace-nowrap">
              <Upload className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span>Importar Excel</span>
            </button>
            <button type="button" onClick={onNavigateToCargar} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition whitespace-nowrap">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>Cargar nuevo</span>
            </button>
          </div>
        </div>
      </div>

      {exportMsg && (
        <div className={`mb-2.5 rounded-xl p-2 text-xs font-semibold shrink-0 ${exportMsg.startsWith('✓') ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {exportMsg}
        </div>
      )}

      {/* Search Box (Fixed, doesn't scroll) */}
      <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-2xs mb-2.5 shrink-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <Search className="h-3.5 w-3.5" />
            </div>
            <input
              id="search-product-input"
              type="text"
              placeholder="Buscar por nombre o código de barras… (búsqueda instantánea)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
            />
            {searchInput && (
              <button type="button" onClick={() => setSearchInput('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 hover:text-gray-600">Limpiar</button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <span className="text-[11px] text-gray-500 font-medium">
              {initialLoading ? 'Buscando…' : `Mostrando ${items.length} de ${total.toLocaleString('es')}`}
            </span>
            <div className="inline-flex rounded-lg bg-gray-100 p-0.5 border border-gray-200">
              <button type="button" onClick={() => setViewMode('table')} className={`p-1 rounded-md transition ${viewMode === 'table' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`} title="Vista en tabla"><List className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition ${viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`} title="Vista en cuadrícula"><Grid className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      {loadError && <div className="mb-2.5 rounded-xl bg-red-50 border border-red-200 p-2 text-xs text-red-700 shrink-0">{loadError}</div>}

      {/* Main Content: Internal Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xs relative"
      >
        {initialLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 gap-2 text-xs">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span>Cargando catálogo…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <div className="h-10 w-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-2"><PackageX className="h-6 w-6" /></div>
            <h3 className="text-sm font-bold text-gray-900">No se encontraron productos</h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-sm mx-auto">
              {searchTerm ? `No hay coincidencias para "${searchTerm}".` : 'Aún no hay productos en el catálogo.'}
            </p>
          </div>
        ) : viewMode === 'table' ? (
          <table className="w-full text-left text-xs text-gray-600 border-collapse">
            <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-xs text-[10px] uppercase font-bold text-gray-500 border-b border-gray-200 tracking-wider z-10 shadow-2xs">
              <tr>
                <th className="px-3.5 py-2">Imagen</th>
                <th className="px-3.5 py-2">Producto / Nombre</th>
                <th className="px-3.5 py-2">Código de barras</th>
                <th className="px-3.5 py-2">Actualizado</th>
                <th className="px-3.5 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/80 transition group">
                  <td className="px-3.5 py-1.5">
                    <div className="h-10 w-10 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                      {p.image ? (
                        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-[8px] text-gray-400 font-medium text-center px-0.5">Sin foto</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 max-w-md">
                    <div className="font-bold text-gray-900 text-xs truncate" title={p.name}>{p.name}</div>
                  </td>
                  <td className="px-3.5 py-1.5 whitespace-nowrap"><BarcodeBadge code={p.code} /></td>
                  <td className="px-3.5 py-1.5 whitespace-nowrap text-[11px] text-gray-500">{formatDate(p.createdAt)}</td>
                  <td className="px-3.5 py-1.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setEditingProduct(p)} className="p-1 rounded-lg text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition" title="Editar producto"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setProductToDelete(p)} className="p-1 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition" title="Eliminar producto"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
            {items.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="relative h-36 sm:h-40 w-full bg-gray-50/60 border-b border-gray-100 flex items-center justify-center p-2 overflow-hidden">
                    {p.image ? (
                      <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-contain hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="text-center p-2 text-gray-400 text-[10px]"><PackageX className="h-6 w-6 mx-auto mb-1 opacity-40" /><span>Sin imagen</span></div>
                    )}
                    <div className="absolute top-1.5 right-1.5">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-600/90 text-white shadow-xs backdrop-blur-xs"><CheckCircle2 className="h-2.5 w-2.5" /> Aprobado</span>
                    </div>
                  </div>
                  <div className="p-2.5 space-y-1">
                    <h3 className="font-bold text-gray-900 text-xs line-clamp-2 leading-tight" title={p.name}>{p.name}</h3>
                    <div><BarcodeBadge code={p.code} /></div>
                  </div>
                </div>
                <div className="px-2.5 py-1.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[9px] text-gray-400">{formatDate(p.createdAt)}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => setEditingProduct(p)} className="p-1 rounded-md text-gray-600 hover:bg-emerald-100 hover:text-emerald-700 transition" title="Editar"><Edit2 className="h-3 w-3" /></button>
                    <button type="button" onClick={() => setProductToDelete(p)} className="p-1 rounded-md text-gray-400 hover:bg-red-100 hover:text-red-600 transition" title="Eliminar"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading More Spinner at bottom of internal container */}
        {loadingMore && (
          <div className="py-3 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span>Cargando más productos…</span>
          </div>
        )}

        {/* End of list banner */}
        {!initialLoading && items.length > 0 && items.length >= total && (
          <div className="py-2.5 text-center text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50/50">
            ✓ Fin del catálogo ({total.toLocaleString('es')} productos)
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      <ProductEditModal
        product={editingProduct}
        currentUser={currentUser}
        isOpen={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
        onSaved={(updated) => {
          setItems((prev) => prev.map((p) => (p.id === editingProduct?.id || p.code === editingProduct?.code ? updated : p)));
          setEditingProduct(null);
          onCountsChange();
        }}
      />

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0"><Trash2 className="h-5 w-5" /></div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">¿Eliminar este producto?</h3>
                <p className="text-xs text-gray-500">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
              <p className="font-bold text-gray-800">{productToDelete.name}</p>
              <p className="font-mono text-gray-500">Código: {productToDelete.code}</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setProductToDelete(null)} className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition">Cancelar</button>
              <button type="button" onClick={() => handleDelete(productToDelete)} className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-600/20 transition">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <Suspense fallback={null}>
          <ImportarExcelModal
            onClose={() => setImportOpen(false)}
            onImportado={() => { cargarInicial(); onCountsChange(); }}
          />
        </Suspense>
      )}
    </div>
  );
};
