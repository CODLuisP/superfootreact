import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeImageProps {
  value: string;
  height?: number;
}

/** Detecta el formato apropiado según el contenido del código. */
function detectarFormato(code: string): 'EAN13' | 'EAN8' | 'CODE128' {
  if (/^\d{13}$/.test(code)) return 'EAN13';
  if (/^\d{8}$/.test(code)) return 'EAN8';
  return 'CODE128';
}

/**
 * Dibuja un código de barras REAL (SVG) con la lectura humana debajo, tipo
 * EAN-13 (7 751211 038933). Si el checksum EAN es inválido, cae a CODE128.
 */
export const BarcodeImage: React.FC<BarcodeImageProps> = ({ value, height = 54 }) => {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    const opciones = {
      displayValue: true,
      height,
      width: 2,
      margin: 8,
      fontSize: 15,
      textMargin: 2,
      background: '#ffffff',
      lineColor: '#111827',
    };
    try {
      JsBarcode(ref.current, value, { ...opciones, format: detectarFormato(value) });
    } catch {
      // Checksum EAN inválido u otro problema: usar CODE128 (acepta cualquier texto).
      try {
        JsBarcode(ref.current, value, { ...opciones, format: 'CODE128' });
      } catch {
        /* nada que dibujar */
      }
    }
  }, [value, height]);

  return (
    <div className="inline-block rounded-xl border border-gray-200 bg-white p-2 shadow-2xs">
      <svg ref={ref} />
    </div>
  );
};
