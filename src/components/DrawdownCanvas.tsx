import { useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import { runCells, runSegments } from '../lib/weave';
import type { FloatRun } from '../lib/weave';

interface DrawdownCanvasProps {
  /** 展开后的组织图：drawdown[pick][warp]，true = 经组织点 */
  drawdown: boolean[][];
  warpColor: string;
  weftColor: string;
  /** 超限浮线（基于展开后坐标） */
  issues: FloatRun[];
  selected: FloatRun | null;
  onSelect: (issue: FloatRun | null) => void;
  /** 单循环的列数/行数（用于画循环边界线） */
  baseCols: number;
  baseRows: number;
  cellSize?: number;
}

/** 组织图：自动计算的交织结果，超限浮线以红框 + 长度数字标出，可点击定位 */
export function DrawdownCanvas({
  drawdown,
  warpColor,
  weftColor,
  issues,
  selected,
  onSelect,
  baseCols,
  baseRows,
  cellSize = 14,
}: DrawdownCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rows = drawdown.length;
  const cols = rows > 0 ? drawdown[0].length : 0;

  // 格子 → 浮线 的索引，用于点击命中
  const cellIndex = useMemo(() => {
    const map = new Map<string, FloatRun>();
    for (const issue of issues) {
      for (const c of runCells(issue, cols, rows)) {
        map.set(`${c.row}:${c.col}`, issue);
      }
    }
    return map;
  }, [issues, cols, rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows === 0 || cols === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cols * cellSize * dpr;
    canvas.height = rows * cellSize * dpr;
    canvas.style.width = `${cols * cellSize}px`;
    canvas.style.height = `${rows * cellSize}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // 交织点
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = drawdown[y][x] ? warpColor : weftColor;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    // 细网格
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, rows * cellSize);
    }
    for (let y = 0; y <= rows; y++) {
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(cols * cellSize, y * cellSize + 0.5);
    }
    ctx.stroke();

    // 循环边界
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.beginPath();
    for (let x = baseCols; x < cols; x += baseCols) {
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, rows * cellSize);
    }
    for (let y = baseRows; y < rows; y += baseRows) {
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(cols * cellSize, y * cellSize + 0.5);
    }
    ctx.stroke();

    // 超限浮线标注
    for (const issue of issues) {
      const isSelected = issue === selected;
      const color = isSelected ? '#7c3aed' : '#e5484d';
      const segs = runSegments(issue, cols, rows);
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      for (const seg of segs) {
        ctx.strokeRect(
          seg.col * cellSize + 1,
          seg.row * cellSize + 1,
          seg.cols * cellSize - 2,
          seg.rows * cellSize - 2,
        );
      }
      if (segs.length > 0) {
        ctx.fillStyle = color;
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(String(issue.length), segs[0].col * cellSize + 2, segs[0].row * cellSize + 2);
      }
    }
  });

  const handleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (rows === 0 || cols === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / cellSize);
    const row = Math.floor((e.clientY - rect.top) / cellSize);
    onSelect(cellIndex.get(`${row}:${col}`) ?? null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="drawdown-canvas"
      onClick={handleClick}
      aria-label="组织图（点击浮线标注可定位相关穿综或踏纹）"
    />
  );
}
