import ExcelJS from 'exceljs';

/**
 * Plantilla e importación masiva desde Excel. Formato esperado:
 *   Código de Barras | Nombre del Producto | URL de Imagen
 * Detecta las columnas por el texto del encabezado (sin importar mayúsculas,
 * acentos, ni el orden exacto de las columnas), no por posición fija.
 */

export type FilaImportada = { fila: number; codigoBarras: string; nombre: string; imagenUrl?: string };
export type ErrorImportacion = { fila: number; error: string };

const VERDE = '10B981';

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '') // quita acentos/diacríticos tras NFD
    .toLowerCase()
    .trim();
}

function detectarColumna(headers: string[], patrones: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizar(headers[i] || '');
    if (patrones.some((p) => p.test(h))) return i;
  }
  return -1;
}

/** Convierte el valor de una celda ExcelJS (texto, rich text o hipervínculo) a string plano. */
function celdaATexto(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
  }
  return String(value);
}

// ─────────────── Plantilla descargable ───────────────
export async function descargarPlantilla(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Superfood';
  const sheet = wb.addWorksheet('Productos');

  sheet.columns = [
    { header: 'Código de Barras', key: 'codigo', width: 24 },
    { header: 'Nombre del Producto', key: 'nombre', width: 48 },
    { header: 'URL de Imagen', key: 'imagen', width: 55 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${VERDE}` } };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
  });
  headerRow.height = 22;
  sheet.getCell('A1').note = 'El código de barras identifica al producto: si ya existe, se actualiza; si no, se crea.';
  sheet.getCell('C1').note = 'Opcional. Debe ser un link http(s) directo a la imagen (jpg, png, webp, gif). Vacío = sin imagen.';

  sheet.addRow({ codigo: '7501055310003', nombre: 'Gaseosa Cola 500ml', imagen: 'https://ejemplo.com/imagenes/cola.jpg' });
  sheet.addRow({ codigo: '7790040000023', nombre: 'Fideos Spaghetti 500g', imagen: '' });
  [2, 3].forEach((r) => {
    sheet.getRow(r).font = { italic: true, color: { argb: 'FF9CA3AF' } };
  });

  sheet.autoFilter = { from: 'A1', to: 'C1' };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'superfood_plantilla_importacion.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────── Parseo del archivo subido ───────────────
export async function parsearExcel(file: File): Promise<{ filas: FilaImportada[]; errores: ErrorImportacion[] }> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('El archivo no tiene ninguna hoja.');

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = celdaATexto(cell.value);
  });

  const colCodigo = detectarColumna(headers, [/codigo/, /barcode/, /\bean\b/, /\bupc\b/]);
  const colNombre = detectarColumna(headers, [/nombre/, /producto/, /\bname\b/]);
  const colImagen = detectarColumna(headers, [/imagen/, /foto/, /\bimage\b/, /\burl\b/]);

  if (colCodigo === -1 || colNombre === -1) {
    throw new Error('No se encontraron las columnas "Código de Barras" y "Nombre del Producto". Usa la plantilla descargable como base.');
  }

  const filas: FilaImportada[] = [];
  const errores: ErrorImportacion[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const codigo = celdaATexto(row.getCell(colCodigo + 1).value).trim();
    const nombre = celdaATexto(row.getCell(colNombre + 1).value).trim();
    const imagen = colImagen !== -1 ? celdaATexto(row.getCell(colImagen + 1).value).trim() : '';

    if (!codigo && !nombre && !imagen) continue; // fila vacía: se ignora sin avisar

    if (!codigo || !nombre) {
      errores.push({
        fila: r,
        error: !codigo && !nombre ? 'Falta código de barras y nombre.' : !codigo ? 'Falta código de barras.' : 'Falta el nombre.',
      });
      continue;
    }
    filas.push({ fila: r, codigoBarras: codigo, nombre, imagenUrl: imagen || undefined });
  }

  return { filas, errores };
}
