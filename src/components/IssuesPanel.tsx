import type { FloatRun } from '../lib/weave';
import { cx } from '../lib/cx';

interface IssuesPanelProps {
  issues: FloatRun[];
  maxFloat: number;
  warpCount: number;
  weftCount: number;
  selected: FloatRun | null;
  onSelect: (issue: FloatRun | null) => void;
}

/** 把展开坐标映射回单循环内的 1-based 编号，生成可读描述 */
function issueLabel(issue: FloatRun, warpCount: number, weftCount: number): string {
  const side = issue.side === 'face' ? '正面' : '背面';
  const wrap = issue.wraps ? ' · 跨循环边界' : '';
  if (issue.direction === 'warp') {
    const warp = (issue.col % warpCount) + 1;
    const r0 = (issue.row % weftCount) + 1;
    const r1 = ((issue.row + issue.length - 1) % weftCount) + 1;
    return `经纱 ${warp} · 第 ${r0}–${r1} 行 · 长 ${issue.length}（${side}）${wrap}`;
  }
  const pick = (issue.row % weftCount) + 1;
  const c0 = (issue.col % warpCount) + 1;
  const c1 = ((issue.col + issue.length - 1) % warpCount) + 1;
  return `第 ${pick} 行 · 经纱 ${c0}–${c1} · 长 ${issue.length}（${side}）${wrap}`;
}

/** 浮线问题列表：点击条目定位到相关穿综列或踏纹行 */
export function IssuesPanel({ issues, maxFloat, warpCount, weftCount, selected, onSelect }: IssuesPanelProps) {
  return (
    <section className="panel">
      <h2>
        浮线检测
        <span className="panel-sub">
          阈值 {maxFloat} 格 · {issues.length > 0 ? `${issues.length} 处超限` : '无超限'}
        </span>
      </h2>
      {issues.length === 0 ? (
        <p className="ok">✓ 未发现超过 {maxFloat} 格的连续浮线</p>
      ) : (
        <ul className="issue-list">
          {issues.map((issue, i) => (
            <li key={`${issue.direction}-${issue.row}-${issue.col}-${i}`}>
              <button
                type="button"
                className={cx('issue', selected === issue && 'active')}
                onClick={() => onSelect(selected === issue ? null : issue)}
                title="点击定位到相关穿综/踏纹，再次点击取消"
              >
                <span className="issue-dir">{issue.direction === 'warp' ? '经向' : '纬向'}</span>
                <span>{issueLabel(issue, warpCount, weftCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">点击问题条目（或组织图中的红框）可定位：经向浮线 → 穿综列，纬向浮线 → 踏纹行。</p>
    </section>
  );
}
