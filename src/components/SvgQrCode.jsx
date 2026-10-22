import React from 'react';
import { createQrMatrix } from '../utils/qrCode';

/**
 * Рендерит QR-код как чистый векторный React SVG компонент
 */
export function SvgQrCode({ text, size = 64, className = '', color = '#000000', bgColor = '#ffffff' }) {
  if (!text) return null;
  const matrix = createQrMatrix(text);
  const matrixSize = matrix.length;
  const margin = 1;
  const total = matrixSize + margin * 2;

  const rects = [];
  for (let y = 0; y < matrixSize; y++) {
    for (let x = 0; x < matrixSize; x++) {
      if (matrix[y][x] === 1) {
        rects.push(
          <rect
            key={`${x}-${y}`}
            x={x + margin}
            y={y + margin}
            width={1}
            height={1}
            fill={color}
          />
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      shapeRendering="crispEdges"
      style={{ backgroundColor: bgColor }}
    >
      <rect x={0} y={0} width={total} height={total} fill={bgColor} />
      {rects}
    </svg>
  );
}
