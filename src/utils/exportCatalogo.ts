import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product } from '../types';
import { api } from '../services/api';

/**
 * Exportación del catálogo a CSV / Excel / PDF, con estilo corporativo
 * (verde Superfood). Respeta el filtro de búsqueda activo en Gestionar.
 *
 * Trae los datos del backend en bloques de 500 (no todo de golpe): funciona
 * igual de bien exportando 50 productos que 10,000, sin saturar memoria/red.
 */

const BLOQUE = 500;
const VERDE = '10B981'; // emerald-500, sin '#': así lo piden exceljs/jspdf
const VERDE_OSCURO = '059669'; // emerald-600
const GRIS_CLARO = 'F3F4F6';
const GRIS_TEXTO = '6B7280';

async function cargarTodos(buscar?: string): Promise<Product[]> {
  const items: Product[] = [];
  let offset = 0;
  for (;;) {
    const pagina = await api.getProductsPage({ status: 'aprobado', buscar, limit: BLOQUE, offset });
    items.push(...pagina.items);
    offset += BLOQUE;
    if (offset >= pagina.total || pagina.items.length === 0) break;
  }
  return items;
}

function nombreArchivo(ext: string) {
  return `superfood_catalogo_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function descargar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fechaCorta(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es');
}

// ─────────────── CSV ───────────────
export async function exportarCSV(buscar?: string): Promise<number> {
  const items = await cargarTodos(buscar);
  const headers = ['Código de Barras', 'Nombre del Producto', 'Estado', 'Última Actualización'];
  const rows = items.map((p) => [p.code, p.name, 'Aprobado', fechaCorta(p.createdAt)]);
  const csv = '﻿' + [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nombreArchivo('csv'));
  return items.length;
}

// ─────────────── Excel (.xlsx) ───────────────
export async function exportarExcel(buscar?: string): Promise<number> {
  const items = await cargarTodos(buscar);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Superfood';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Catálogo', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { width: 22 },
    { width: 48 },
    { width: 14 },
    { width: 20 },
  ];

  // Encabezado de marca
  sheet.mergeCells('A1:D1');
  const titulo = sheet.getCell('A1');
  titulo.value = 'Superfood — Catálogo de Productos';
  titulo.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left' };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${VERDE_OSCURO}` } };
  sheet.getRow(1).height = 30;
  ['B1', 'C1', 'D1'].forEach((ref) => {
    sheet.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${VERDE_OSCURO}` } };
  });

  sheet.mergeCells('A2:D2');
  const subtitulo = sheet.getCell('A2');
  subtitulo.value = `Generado el ${new Date().toLocaleString('es')}  ·  ${items.length.toLocaleString('es')} producto(s)${buscar ? `  ·  Filtro: "${buscar}"` : ''}`;
  subtitulo.font = { italic: true, size: 10, color: { argb: `FF${GRIS_TEXTO}` } };
  sheet.getRow(2).height = 18;

  // Encabezados de columna
  const HEADER_ROW = 4;
  const headers = ['Código de Barras', 'Nombre del Producto', 'Estado', 'Última Actualización'];
  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.values = headers;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${VERDE}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
  });
  headerRow.height = 20;

  // Filas de datos (cebra + bordes suaves)
  items.forEach((p, i) => {
    const row = sheet.addRow([p.code, p.name, 'Aprobado', fechaCorta(p.createdAt)]);
    row.height = 18;
    row.alignment = { vertical: 'middle' };
    row.getCell(1).font = { name: 'Consolas', size: 10 };
    row.getCell(3).font = { color: { argb: `FF${VERDE_OSCURO}` }, bold: true };
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GRIS_CLARO}` } };
      });
    }
    row.eachCell((cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
    });
  });

  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };

  const buffer = await wb.xlsx.writeBuffer();
  descargar(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nombreArchivo('xlsx')
  );
  return items.length;
}

// ─────────────── PDF ───────────────
export async function exportarPDF(buscar?: string): Promise<number> {
  const items = await cargarTodos(buscar);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brand: [number, number, number] = [16, 185, 129]; // emerald-500

  const dibujarEncabezado = () => {
    doc.setFillColor(...brand);
    doc.rect(0, 0, pageWidth, 60, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Superfood — Catálogo de Productos', 40, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Generado el ${new Date().toLocaleString('es')}  ·  ${items.length.toLocaleString('es')} producto(s)${buscar ? `  ·  Filtro: "${buscar}"` : ''}`,
      40,
      48
    );
  };

  autoTable(doc, {
    startY: 80,
    head: [['Código de Barras', 'Nombre del Producto', 'Estado', 'Actualizado']],
    body: items.map((p) => [p.code, p.name, 'Aprobado', fechaCorta(p.createdAt)]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 6, textColor: [17, 24, 39], lineColor: [229, 231, 235], lineWidth: 0.5 },
    headStyles: { fillColor: brand, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    columnStyles: {
      0: { font: 'courier', cellWidth: 110 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 60, textColor: [5, 150, 105], fontStyle: 'bold' },
      3: { cellWidth: 90 },
    },
    margin: { top: 80, left: 40, right: 40, bottom: 40 },
    didDrawPage: dibujarEncabezado,
  });

  // Pie de página con "Página X de Y" (se hace después: recién ahí se sabe el total).
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Superfood', 40, pageHeight - 20);
    doc.text(`Página ${i} de ${totalPaginas}`, pageWidth - 110, pageHeight - 20);
  }

  doc.save(nombreArchivo('pdf'));
  return items.length;
}
