import type { ExecutorState, JourneyDef } from '../domain/types';

const STATUS_TEXT = { pending: '待到达', accepted: '已接受', invalidated: '已失效' } as const;

export function JourneyPanel({ exec, journey }: { exec: ExecutorState; journey: JourneyDef }) {
  const banner =
    exec.status === 'completed'
      ? { cls: 'ok', text: '旅程完成：三步全部接受' }
      : exec.status === 'failed'
        ? {
            cls: 'bad',
            text: `旅程断裂：步骤「${exec.steps.find((s) => s.status === 'invalidated')?.def.title ?? '?'}」失效，可撤销、调整契约后重放或重置`,
          }
        : {
            cls: 'run',
            text: `进行中：等待步骤「${journey.steps[exec.stepIndex]?.title ?? '?'}」的 ${journey.steps[exec.stepIndex]?.expects ?? ''} 事件`,
          };

  return (
    <div className="panel">
      <h2>旅程重放</h2>
      <div className="stepper">
        {exec.steps.map((s, i) => (
          <div key={s.def.id} className="step-wrap">
            <div
              className={`step ${s.status} ${i === exec.stepIndex && exec.status === 'running' ? 'current' : ''}`}
            >
              <div className="step-dot">{s.status === 'accepted' ? '✓' : s.status === 'invalidated' ? '✗' : i + 1}</div>
              <div className="step-title">{s.def.title}</div>
              <div className="step-expects mono">{s.def.expects}</div>
              <div className={`step-status ${s.status}`}>{STATUS_TEXT[s.status]}</div>
              {s.note && <div className="step-note">{s.note}</div>}
            </div>
            {i < exec.steps.length - 1 && <div className={`step-link ${s.status === 'accepted' ? 'done' : ''}`} />}
          </div>
        ))}
      </div>
      <div className={`banner ${banner.cls}`}>{banner.text}</div>
      <div className="meta-row">
        <span>已处理 {exec.records.length} 条</span>
        <span>缓冲等待 {exec.buffered.length} 条</span>
        <span>下游事件 {exec.downstream.length} 条</span>
        <span>隐私阻断 {exec.privacyBlocks} 起</span>
      </div>
    </div>
  );
}
