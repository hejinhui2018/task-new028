import { Fragment } from 'react';
import { cx } from '../lib/cx';

interface TreadlingGridProps {
  treadling: number[];
  treadleCount: number;
  /** 需要定位高亮的纬纱行（0-based），null 表示无 */
  highlightWeft: number | null;
  onSet: (pick: number, treadle: number) => void;
}

/** 踏纹图：行 = 纬纱（第 1 行在顶部），列 = 踏板 */
export function TreadlingGrid({ treadling, treadleCount, highlightWeft, onSet }: TreadlingGridProps) {
  return (
    <div
      className="editor-grid"
      role="grid"
      aria-label="踏纹图"
      style={{ gridTemplateColumns: `auto repeat(${treadleCount}, var(--cell))` }}
    >
      <div className="axis axis-row" />
      {Array.from({ length: treadleCount }, (_, t) => (
        <div key={t} className="axis axis-col">
          {t + 1}
        </div>
      ))}
      {treadling.map((cur, p) => (
        <Fragment key={p}>
          <div className={cx('axis', 'axis-row', highlightWeft === p && 'axis-hl')}>{p + 1}</div>
          {Array.from({ length: treadleCount }, (_, t) => (
            <div
              key={t}
              role="button"
              tabIndex={-1}
              aria-label={`第 ${p + 1} 行纬纱踩踏板 ${t + 1}`}
              title={`第 ${p + 1} 行 → 踏板 ${t + 1}`}
              className={cx('cell', cur === t && 'filled', highlightWeft === p && 'hl')}
              onClick={() => onSet(p, t)}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
