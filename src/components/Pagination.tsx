import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number; // 0-based
  totalPages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

/** Paginación con Anterior/Siguiente + salto directo a una página (útil con cientos de páginas). */
export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, loading, onPageChange }) => {
  const [jumpValue, setJumpValue] = useState(String(page + 1));

  // Si la página cambia desde afuera (Anterior/Siguiente), refleja el número en el input.
  useEffect(() => { setJumpValue(String(page + 1)); }, [page]);

  const irAPagina = () => {
    const n = parseInt(jumpValue, 10);
    if (!Number.isFinite(n)) { setJumpValue(String(page + 1)); return; }
    const destino = Math.min(Math.max(n, 1), totalPages) - 1;
    onPageChange(destino);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
      <button
        type="button"
        disabled={page === 0 || loading}
        onClick={() => onPageChange(Math.max(0, page - 1))}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Anterior
      </button>

      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span>Página</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && irAPagina()}
          onBlur={irAPagina}
          className="w-16 text-center rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-hidden transition"
        />
        <span>de <strong className="text-gray-800">{totalPages.toLocaleString('es')}</strong></span>
      </div>

      <button
        type="button"
        disabled={page + 1 >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Siguiente <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
