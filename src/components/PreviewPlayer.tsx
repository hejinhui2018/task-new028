import { useEffect, useRef, useState } from 'react';
import { createPreview, resetPreview, stepPreview, syncPreview } from '../lib/preview';
import type { PreviewState } from '../lib/preview';

interface PreviewPlayerProps {
  /** 展开后的组织图（最新计算结果；预演不缓存行内容，编辑后立即反映） */
  drawdown: boolean[][];
  /** 基础踏纹序列（用于显示当前行踩下的踏板） */
  treadling: number[];
  warpColor: string;
  weftColor: string;
  /** 单循环行数（画循环边界线） */
  baseRows: number;
}

const CELL = 14;

/** 逐纬试织预演：按踏纹顺序一行行生成布面 */
export function PreviewPlayer({ drawdown, treadling, warpColor, weftColor, baseRows }: PreviewPlayerProps) {
  const totalRows = drawdown.length;
  const cols = totalRows > 0 ? drawdown[0].length : 0;
  const [state, setState] = useState<PreviewState>(createPreview);
  const [speed, setSpeed] = useState(400);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 编辑导致总行数变化（如循环次数调整）时钳制当前行
  useEffect(() => {
    setState((s) => syncPreview(s, totalRows));
  }, [totalRows]);

  // 自动播放
  useEffect(() => {
    if (!state.playing) return;
    const timer = window.setInterval(() => {
      setState((s) => stepPreview(s, totalRows));
    }, speed);
    return () => window.clearInterval(timer);
  }, [state.playing, speed, totalRows]);

  // 渲染：已织行始终取自当前最新组织图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || totalRows === 0 || cols === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cols * CELL * dpr;
    canvas.height = totalRows * CELL * dpr;
    canvas.style.width = `${cols * CELL}px`;
    canvas.style.height = `${totalRows * CELL}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    for (let y = 0; y < totalRows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = y < state.pick ? (drawdown[y][x] ? warpColor : weftColor) : '#edf0f4';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, totalRows * CELL);
    }
    for (let y = 0; y <= totalRows; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(cols * CELL, y * CELL + 0.5);
    }
    ctx.stroke();

    // 循环边界
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
    ctx.beginPath();
    for (let y = baseRows; y < totalRows; y += baseRows) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(cols * CELL, y * CELL + 0.5);
    }
    ctx.stroke();

    // 织口（最近织入的一行）
    if (state.pick > 0) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, (state.pick - 1) * CELL + 1, cols * CELL - 2, CELL - 2);
    }
  });

  const finished = state.pick >= totalRows;
  const currentTreadle = state.pick > 0 ? treadling[(state.pick - 1) % treadling.length] : null;

  return (
    <div className="preview">
      <div className="preview-controls">
        <button
          className="btn btn-primary"
          onClick={() => setState((s) => ({ ...s, playing: !s.playing }))}
          disabled={finished && !state.playing}
        >
          {state.playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button
          className="btn"
          onClick={() => setState((s) => stepPreview({ ...s, playing: false }, totalRows))}
          disabled={finished}
        >
          步进一行
        </button>
        <button className="btn" onClick={() => setState(resetPreview())}>
          重置
        </button>
        <label className="speed">
          速度
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={800}>慢</option>
            <option value={400}>中</option>
            <option value={150}>快</option>
          </select>
        </label>
        <span className="preview-status">
          已织 {state.pick} / {totalRows} 行
          {currentTreadle !== null ? ` · 第 ${state.pick} 行踩踏板 ${currentTreadle + 1}` : ''}
          {finished ? ' · 完成' : ''}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${totalRows > 0 ? (state.pick / totalRows) * 100 : 0}%` }} />
      </div>
      <div className="canvas-scroll preview-scroll">
        <canvas ref={canvasRef} aria-label="试织预演布面" />
      </div>
      <p className="hint">
        预演不缓存已织行：编辑穿综、提综或踏纹后，已织部分与后续行都会按最新组织重新渲染，从当前行继续播放亦然。
      </p>
    </div>
  );
}
