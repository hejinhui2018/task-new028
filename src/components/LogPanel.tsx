import type { ExecutorState, JourneyDef, Verdict } from '../domain/types';

export const VERDICT_TEXT: Record<Verdict, string> = {
  accepted: '接受',
  waiting: '等待',
  blocked: '阻断',
  invalid: '失效',
  duplicate: '重复',
};

export function VerdictBadge({ v }: { v: Verdict }) {
  return <span className={`badge ${v}`}>{VERDICT_TEXT[v]}</span>;
}

export function LogPanel({ exec, journey }: { exec: ExecutorState; journey: JourneyDef }) {
  const stepTitle = (id: string | null) => journey.steps.find((s) => s.id === id)?.title ?? null;
  return (
    <div className="panel grow">
      <h2>处理日志（{exec.records.length}）</h2>
      {exec.records.length === 0 && <p className="hint">尚未处理任何事件。点击「单步」或「自动播放」开始重放。</p>}
      <div className="log">
        {exec.records.map((r) => (
          <div className={`record ${r.verdict}`} key={r.seq}>
            <div className="rhead">
              <span className="seq">#{r.seq + 1}</span>
              <VerdictBadge v={r.verdict} />
              <span className={`ver ${r.event.version}`}>{r.event.version}</span>
              <span className="mono name">{r.event.name}</span>
              {r.adapted && r.adapted.name !== r.event.name && (
                <span className="mono mapped">→ {r.adapted.name}</span>
              )}
              {stepTitle(r.stepId) && <span className="step-tag">{stepTitle(r.stepId)}</span>}
            </div>
            {r.reasons.length > 0 && (
              <ul className="reasons">
                {r.reasons.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
            {r.impacts.length > 0 && (
              <ul className="impacts">
                {r.impacts.map((im, i) => (
                  <li key={i} className={`impact ${im.level}`}>
                    {im.text}
                  </li>
                ))}
              </ul>
            )}
            {r.adapted && r.adapted.missing.length > 0 && (
              <div className="missing">
                缺失字段（未伪造）：
                {r.adapted.missing.map((m) => (
                  <code key={m}>{m}</code>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
