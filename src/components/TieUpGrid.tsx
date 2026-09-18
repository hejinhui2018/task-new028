import { Fragment } from 'react';
import { cx } from '../lib/cx';

interface TieUpGridProps {
  /** tieUp[harness][treadle] */
  tieUp: boolean[][];
  treadleCount: number;
  onToggle: (harness: number, treadle: number) => void;
}

/** 提综图（综框 × 踏板连接矩阵）：行 = 综框（与穿综图对齐），列 = 踏板 */
export function TieUpGrid({ tieUp, treadleCount, onToggle }: TieUpGridProps) {
  const harnessRows = Array.from({ length: tieUp.length }, (_, i) => tieUp.length - 1 - i);
  return (
    <div
      className="editor-grid"
      role="grid"
      aria-label="提综图"
      style={{ gridTemplateColumns: `auto repeat(${treadleCount}, var(--cell))` }}
    >
      <div className="axis axis-row" />
      {Array.from({ length: treadleCount }, (_, t) => (
        <div key={t} className="axis axis-col">
          {t + 1}
        </div>
      ))}
      {harnessRows.map((h) => (
        <Fragment key={h}>
          <div className="axis axis-row">综{h + 1}</div>
          {tieUp[h].map((v, t) => (
            <div
              key={t}
              role="button"
              tabIndex={-1}
              aria-label={`综框 ${h + 1} 与踏板 ${t + 1} ${v ? '已连接' : '未连接'}`}
              title={`综框 ${h + 1} ↔ 踏板 ${t + 1}`}
              className={cx('cell', v && 'filled')}
              onClick={() => onToggle(h, t)}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
