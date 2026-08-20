import React, { useRef, useState } from 'react';
import { api } from '../services/api';
import { descargarPlantilla, parsearExcel, FilaImportada, ErrorImportacion } from '../utils/importCatalogo';
import { Download, Upload, X, AlertTriangle, AlertCircle, CheckCircle2, Loader2, FileSpreadsheet } from 'lucide-react';

interface ImportarExcelModalProps {
  onClose: () => void;
  onImportado: () => void; // refresca la página actual + los contadores
}

type Resultado = { total: number; creados: number; actualizados: number; errores: ErrorImportacion[] };

export const ImportarExcelModal: React.FC<ImportarExcelModalProps> = ({ onClose, onImportado }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [parseando, setParseando] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImportada[]>([]);
  const [erroresParseo, setErroresParseo] = useState<ErrorImportacion[]>([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [huboImportacion, setHuboImportacion] = useState(false);

  const elegirArchivo = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setParseError('Solo se aceptan archivos .xlsx (Excel). Usa la plantilla descargable como base.');
      return;
    }
    setNombreArchivo(file.name);
    setParseError(null);
    setResultado(null);
    setParseando(true);
    try {
      const { filas: f, errores } = await parsearExcel(file);
      setFilas(f);
      setErroresParseo(errores);
      if (f.length === 0 && errores.length === 0) {
        setParseError('El archivo no tiene filas de datos debajo del encabezado.');
      }
    } catch (err) {
      setParseError((err as Error).message);
      setFilas([]);
      setErroresParseo([]);
    } finally {
      setParseando(false);
    }
  };

  const importar = async () => {
    if (filas.length === 0) return;
    setImportando(true);
    setParseError(null);
    try {
      const r = await api.bulkImport(filas.map((f) => ({ codigoBarras: f.codigoBarras, nombre: f.nombre, imagenUrl: f.imagenUrl })));
      setResultado(r);
      setHuboImportacion(true);
    } catch (err) {
      setParseError((err as Error).message || 'No se pudo importar.');
    } finally {
      setImportando(false);
    }
  };

  const reiniciar = () => {
    setNombreArchivo('');
    setFilas([]);
    setErroresParseo([]);
    setParseError(null);
    setResultado(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const cerrar = () => {
    if (huboImportacion) onImportado();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onClick={importando ? undefined : cerrar}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 leading-none">Importar productos desde Excel</h3>
              <p className="text-xs text-gray-500 mt-1">Código de barras, nombre y URL de imagen (opcional).</p>
            </div>
          </div>
          <button onClick={cerrar} disabled={importando} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-4">
          {/* Paso 1: plantilla */}
          <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
            <span className="text-xs text-gray-600">¿No tienes el archivo listo? Descarga la plantilla con las columnas correctas.</span>
            <button type="button" onClick={() => descargarPlantilla()} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition">
              <Download className="h-3.5 w-3.5" /> Plantilla
            </button>
          </div>

          {/* Paso 2: elegir archivo */}
          {!resultado && (
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={parseando}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-emerald-600/20 transition"
              >
                <Upload className="h-3.5 w-3.5" /> {nombreArchivo ? 'Cambiar archivo' : 'Elegir archivo .xlsx'}
              </button>
              {nombreArchivo && <span className="text-xs text-gray-500 truncate">{nombreArchivo}</span>}
            </div>
          )}

          {parseando && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo archivo…</p>
          )}
          {parseError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Vista previa antes de importar */}
          {!resultado && !parseando && (filas.length > 0 || erroresParseo.length > 0) && (
            <>
              <div className="flex items-center gap-4 text-xs">
                <span className="font-semibold text-emerald-700">✓ {filas.length.toLocaleString('es')} fila(s) lista(s) para importar</span>
                {erroresParseo.length > 0 && <span className="font-semibold text-amber-700">⚠ {erroresParseo.length} fila(s) con error</span>}
              </div>

              {erroresParseo.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 space-y-0.5">
                  {erroresParseo.slice(0, 20).map((e) => (
                    <div key={e.fila} className="text-[11px] text-amber-800">Fila {e.fila}: {e.error}</div>
                  ))}
                  {erroresParseo.length > 20 && <div className="text-[11px] text-amber-700">…y {erroresParseo.length - 20} más.</div>}
                </div>
              )}

              {filas.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500 sticky top-0">
                      <tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Imagen</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filas.slice(0, 8).map((f) => (
                        <tr key={f.fila}>
                          <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{f.codigoBarras}</td>
                          <td className="px-3 py-2">{f.nombre}</td>
                          <td className="px-3 py-2 text-gray-400">{f.imagenUrl ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filas.length > 8 && <p className="text-[11px] text-gray-400 px-3 py-2 border-t border-gray-100">…y {(filas.length - 8).toLocaleString('es')} fila(s) más.</p>}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
                <button onClick={reiniciar} disabled={importando} className="rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-gray-700 transition">
                  Elegir otro archivo
                </button>
                <button onClick={importar} disabled={importando || filas.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition">
                  {importando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {importando ? 'Importando…' : `Importar ${filas.length.toLocaleString('es')} producto(s)`}
                </button>
              </div>
            </>
          )}

          {/* Resultado final */}
          {resultado && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{resultado.creados.toLocaleString('es')} creado(s), {resultado.actualizados.toLocaleString('es')} actualizado(s) de {resultado.total.toLocaleString('es')} fila(s).</span>
              </div>
              {resultado.errores.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  <div className="flex items-center gap-1.5 mb-1.5 font-bold"><AlertTriangle className="h-3.5 w-3.5" /><span>{resultado.errores.length} fila(s) no se importaron:</span></div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {resultado.errores.slice(0, 30).map((e, i) => (
                      <div key={i}>Fila {e.fila}: {e.error}</div>
                    ))}
                    {resultado.errores.length > 30 && <div>…y {resultado.errores.length - 30} más.</div>}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
                <button onClick={reiniciar} className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition">Importar otro archivo</button>
                <button onClick={cerrar} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition">Listo</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
