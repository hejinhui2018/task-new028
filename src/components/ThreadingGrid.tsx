import { Fragment } from 'react';
import { cx } from '../lib/cx';

interface ThreadingGridProps {
  threading: number[];
  harnessCount: number;
  /** 需要定位高亮的经纱列（0-based），null 表示无 */
  highlightWarp: number | null;
  onSet: (warp: number, harness: number) => void;
}

/** 穿综图：行 = 综框（综 1 在最下，靠近组织图），列 = 经纱 */
export function ThreadingGrid({ threading, harnessCount, highlightWarp, onSet }: ThreadingGridProps) {
  const harnessRows = Array.from({ length: harnessCount }, (_, i) => harnessCount - 1 - i);
  return (
    <div
      className="editor-grid"
      role="grid"
      aria-label="穿综图"
      style={{ gridTemplateColumns: `auto repeat(${threading.length}, var(--cell))` }}
    >
      {harnessRows.map((h) => (
        <Fragment key={h}>
          <div className="axis axis-row">综{h + 1}</div>
          {threading.map((cur, w) => (
            <div
              key={w}
              role="button"
              tabIndex={-1}
              aria-label={`经纱 ${w + 1} 穿入综框 ${h + 1}`}
              title={`经纱 ${w + 1} → 综框 ${h + 1}`}
              className={cx('cell', cur === h && 'filled', highlightWarp === w && 'hl')}
              onClick={() => onSet(w, h)}
            />
          ))}
        </Fragment>
      ))}
      <div className="axis axis-row" />
      {threading.map((_, w) => (
        <div key={w} className={cx('axis', 'axis-col', highlightWarp === w && 'axis-hl')}>
          {w + 1}
        </div>
      ))}
    </div>
  );
}
