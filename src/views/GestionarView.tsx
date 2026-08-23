import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Product, User } from '../types';
import { api } from '../services/api';
import { BarcodeBadge } from '../components/BarcodeBadge';
import { ProductEditModal } from '../components/ProductEditModal';
import { Pagination } from '../components/Pagination';
import {
  Search, Grid, List, Edit2, Trash2, FileText, FileSpreadsheet, FileType, CheckCircle2, Plus, PackageX, Upload,
} from 'lucide-react';

// Carga diferida: ImportarExcelModal usa ExcelJS (pesado). Que no viaje en el
// bundle principal ni se descargue hasta que de verdad abras "Importar Excel".
const ImportarExcelModal = React.lazy(() =>
  import('../components/ImportarExcelModal').then((m) => ({ default: m.ImportarExcelModal }))
);

interface GestionarViewProps {
  currentUser: User;
  onCountsChange: () => void;
  onNavigateToCargar: () => void;
}

const PAGE_SIZE = 24;

export const GestionarView: React.FC<GestionarViewProps> = ({ currentUser, onCountsChange, onNavigateToCargar }) => {
  const [searchInput, setSearchInput] = useState(''); // lo que el usuario escribe
  const [searchTerm, setSearchTerm] = useState(''); // aplicado (debounced)
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Debounce: no pega al backend en cada tecla, espera una pausa breve.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(0); // nueva búsqueda: vuelve a la primera página
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const cargarPagina = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { items: pageItems, total: pageTotal } = await api.getProductsPage({
        status: 'aprobado',
        buscar: searchTerm || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(pageItems);
      setTotal(pageTotal);
    } catch (err) {
      setLoadError((err as Error).message || 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page]);

  useEffect(() => { cargarPagina(); }, [cargarPagina]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleDelete = async (product: Product) => {
    await api.deleteProduct(product.code, 'aprobado');
    setProductToDelete(null);
    // Si borramos el único item de la última página, retrocede una página.
    if (items.length === 1 && page > 0) setPage((p) => p - 1);
    else await cargarPagina();
    onCountsChange();
  };

  const [exportando, setExportando] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async (formato: 'csv' | 'excel' | 'pdf') => {
    setExportando(formato);
    setExportMsg(null);
    try {
      // Carga diferida: ExcelJS y jsPDF pesan bastante, así no viajan en el
      // bundle principal (ni se descargan) a menos que de verdad exportes.
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">Gestionar Catálogo</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {total.toLocaleString('es')} producto{total === 1 ? '' : 's'} en total. Busca, edita o elimina.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-300 bg-white shadow-2xs overflow-hidden divide-x divide-gray-200">
            <button
              type="button"
              disabled={exportando !== null}
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition"
              title="Exportar CSV"
            >
              <FileText className="h-3.5 w-3.5 text-gray-500" />
              <span>{exportando === 'csv' ? 'Exportando…' : 'CSV'}</span>
            </button>
            <button
              type="button"
              disabled={exportando !== null}
              onClick={() => handleExport('excel')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition"
              title="Exportar Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>{exportando === 'excel' ? 'Exportando…' : 'Excel'}</span>
            </button>
            <button
              type="button"
              disabled={exportando !== null}
              onClick={() => handleExport('pdf')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait transition"
              title="Exportar PDF"
            >
              <FileType className="h-3.5 w-3.5 text-red-500" />
              <span>{exportando === 'pdf' ? 'Exportando…' : 'PDF'}</span>
            </button>
          </div>
          <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition">
            <Upload className="h-3.5 w-3.5 text-gray-500" />
            <span>Importar Excel</span>
          </button>
          <button type="button" onClick={onNavigateToCargar} className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition">
            <Plus className="h-3.5 w-3.5" />
            <span>Cargar nuevo</span>
          </button>
        </div>
      </div>

      {exportMsg && (
        <div className={`mb-4 rounded-xl p-2.5 text-xs font-semibold ${exportMsg.startsWith('✓') ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {exportMsg}
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
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
              className="w-full rounded-xl border border-gray-300 pl-9 pr-4 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
            />
            {searchInput && (
              <button type="button" onClick={() => setSearchInput('')} className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 hover:text-gray-600">Limpiar</button>
            )}
          </div>

          <div className="inline-flex rounded-xl bg-gray-100 p-0.5 border border-gray-200 shrink-0">
            <button type="button" onClick={() => setViewMode('table')} className={`p-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`} title="Vista en tabla"><List className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`} title="Vista en cuadrícula"><Grid className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {loading && <p className="text-[11px] text-gray-400 mt-1.5">Buscando…</p>}
        {!loading && (
          <p className="text-[11px] text-gray-500 mt-1.5">
            Mostrando <strong className="text-gray-800">{items.length ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + items.length}</strong> de <strong className="text-gray-800">{total.toLocaleString('es')}</strong>
          </p>
        )}
      </div>

      {loadError && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">{loadError}</div>}

      {/* Product Content */}
      {!loading && items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="h-10 w-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-2"><PackageX className="h-6 w-6" /></div>
          <h3 className="text-sm font-bold text-gray-900">No se encontraron productos</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-sm mx-auto">
            {searchTerm ? `No hay coincidencias para "${searchTerm}".` : 'Aún no hay productos en el catálogo.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50/80 text-[10px] uppercase font-bold text-gray-500 border-b border-gray-200 tracking-wider">
                <tr>
                  <th className="px-3.5 py-2.5">Imagen</th>
                  <th className="px-3.5 py-2.5">Producto / Nombre</th>
                  <th className="px-3.5 py-2.5">Código de barras</th>
                  <th className="px-3.5 py-2.5">Actualizado</th>
                  <th className="px-3.5 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition group">
                    <td className="px-3.5 py-2">
                      <div className="h-10 w-10 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {p.image ? <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <span className="text-[9px] text-gray-400 font-medium text-center px-0.5">Sin foto</span>}
                      </div>
                    </td>
                    <td className="px-3.5 py-2 max-w-xs">
                      <div className="font-bold text-gray-900 text-xs truncate">{p.name}</div>
                    </td>
                    <td className="px-3.5 py-2 whitespace-nowrap"><BarcodeBadge code={p.code} /></td>
                    <td className="px-3.5 py-2 whitespace-nowrap text-[11px] text-gray-500">{formatDate(p.createdAt)}</td>
                    <td className="px-3.5 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setEditingProduct(p)} className="p-1 rounded-lg text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition" title="Editar producto"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setProductToDelete(p)} className="p-1 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition" title="Eliminar producto"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {items.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="relative h-24 w-full bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden">
                  {p.image ? (
                    <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="text-center p-2 text-gray-400 text-[10px]"><PackageX className="h-5 w-5 mx-auto mb-0.5 opacity-50" /><span>Sin imagen</span></div>
                  )}
                  <div className="absolute top-1.5 right-1.5">
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-emerald-600/90 text-white shadow-xs backdrop-blur-xs"><CheckCircle2 className="h-2 w-2" /> Aprobado</span>
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  <h3 className="font-bold text-gray-900 text-[11px] line-clamp-2 leading-tight">{p.name}</h3>
                  <div><BarcodeBadge code={p.code} /></div>
                </div>
              </div>
              <div className="px-2 py-1.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
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

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <Pagination page={page} totalPages={totalPages} loading={loading} onPageChange={setPage} />
      )}

      {/* Edit Product Modal */}
      <ProductEditModal
        product={editingProduct}
        currentUser={currentUser}
        isOpen={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
        onSaved={() => { cargarPagina(); setEditingProduct(null); onCountsChange(); }}
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
            onImportado={() => { setPage(0); cargarPagina(); onCountsChange(); }}
          />
        </Suspense>
      )}
    </div>
  );
};
