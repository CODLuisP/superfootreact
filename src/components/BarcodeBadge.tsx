import React from 'react';
import { Barcode as BarcodeIcon } from 'lucide-react';

interface BarcodeBadgeProps {
  code: string;
  className?: string;
  showIcon?: boolean;
}

export const BarcodeBadge: React.FC<BarcodeBadgeProps> = ({
  code,
  className = '',
  showIcon = true,
}) => {
  // Generate pseudo-bars based on code characters for authentic barcode look
  const bars = React.useMemo(() => {
    if (!code) return [];
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash + code.charCodeAt(i) * (i + 1)) | 0;
    }
    const pattern: number[] = [];
    for (let i = 0; i < 28; i++) {
      const val = Math.abs((hash >> (i % 16)) + i * 7) % 3 + 1;
      pattern.push(val);
    }
    return pattern;
  }, [code]);

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-100/90 border border-gray-200/80 text-gray-800 ${className}`}
    >
      {showIcon && <BarcodeIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
      <div className="flex flex-col">
        <span className="font-mono text-xs font-semibold tracking-wider text-gray-900 leading-none">
          {code}
        </span>
        <div className="flex items-end gap-px h-2.5 mt-0.5 opacity-60">
          {bars.map((width, idx) => (
            <span
              key={idx}
              className="bg-gray-800 h-full inline-block"
              style={{ width: `${width * 1.2}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
