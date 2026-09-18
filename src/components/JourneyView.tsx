import { useStore } from '../state/store';
import type { JourneySnapshot, StepRecord } from '../domain/types';

const STATUS_LABEL: Record<StepRecord['status'], string> = {
  accepted: '接受',
  waiting: '等待',
  blocked: '阻断',
  invalid: '失效',
};

const IMPACT_LABEL: Record<string, string> = {
  session: '会话关联',
  experiment: '实验分组',
  attribution: '转化归因',
  conversion: '转化',
  downstream: '下游',
};

const EFFECT_LABEL: Record<string, string> = {
  ok: '正常',
  degraded: '降级',
  blocked: '阻断',
  pending: '待定',
};

export function JourneyTrack({ snapshot }: { snapshot: JourneySnapshot }) {
  const { state } = useStore();
  const waitingCount = snapshot.waiting.length;
  return (
    <div className="panel">
      <h2>
        用户旅程：{state.bundle.journey.name}
        {waitingCount > 0 && (
          <span className="lk-state warn" style={{ marginLeft: 6 }}>
            {waitingCount} 个事件缓冲中
          </span>
        )}
        {snapshot.finished && <span className="lk-state ok" style={{ marginLeft: 6 }}>旅程完成</span>}
      </h2>
      <div className="journey-track">
        {state.bundle.journey.stages.map((stage) => {
          const info = snapshot.stages[stage.key];
          return (
            <div key={stage.key} className={`j-stage${info.reached ? ' reached' : ''}`}>
              <div className="dot">{info.reached ? '✓' : '·'}</div>
              <div className="j-label">{stage.label}</div>
              <div className="j-event">{stage.event}</div>
              {info.reached && <div className="sub muted small mono" style={{ marginTop: 2 }}>{info.eventId}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PayloadDiff({ step }: { step: StepRecord }) {
  if (step.status === 'waiting') return null;
  if (!step.normalized) {
    return (
      <div className="payload">
        <span className="muted">∅ 不产生下游记录</span>
      </div>
    );
  }
  const n = step.normalized;
  return (
    <div className="payload">
      <span className="muted">下游负载 v{n.schemaVersion}：</span>
      {'\n'}
      {n.migratedFrom ? (
        <>
          {n.migratedFrom}
          <span className="arrow">→</span>
        </>
      ) : null}
      {n.name}
      {n.transformedVia.length > 0 && (
        <>
          {'\n'}
          <span className="muted">转换：</span>
          {n.transformedVia.join('  ')}
        </>
      )}
      {'\n'}
      {JSON.stringify(n.props, null, 0)}
    </div>
  );
}

function StepCard({ step }: { step: StepRecord }) {
  return (
    <div className={`step ${step.status}`}>
      <div className="step-head">
        <span className="idx">#{step.index + 1}</span>
        <span className={`ver-tag ${step.source === 'v1-sdk' ? 'v1' : 'v2'}`}>
          {step.source === 'v1-sdk' ? 'v1' : 'v2'}
        </span>
        <span className="evt">{step.rawName}</span>
        <span className="muted small mono">{step.eventId}</span>
        <span className="spacer" />
        {step.flushed && <span className="fault-tag" style={{ background: 'var(--accepted-soft)', color: 'var(--accepted)', borderColor: '#34c08a55' }}>缓冲释放</span>}
        <span className={`status-pill ${step.status}`}>{STATUS_LABEL[step.status]}</span>
        <span className="clock">到达 {step.arrivalMs}ms</span>
      </div>
      <ul className="reasons">
        {step.reasons.map((r, i) => (
          <li key={i}>{r.message}</li>
        ))}
      </ul>
      <div className="impacts">
        {step.impacts.map((imp, i) => (
          <span key={i} className={`impact ${imp.effect}`} title={imp.detail}>
            <span className="t">{IMPACT_LABEL[imp.target] ?? imp.target}</span>
            <span className="e">{EFFECT_LABEL[imp.effect] ?? imp.effect}</span>
          </span>
        ))}
      </div>
      <PayloadDiff step={step} />
    </div>
  );
}

export function StepLog({ steps }: { steps: StepRecord[] }) {
  return (
    <div className="panel" style={{ flex: 1 }}>
      <h2>
        状态化判定日志
        <span className="muted small">（接受 / 等待 / 阻断 / 失效，及对三条链路的影响）</span>
      </h2>
      <div className="body">
        {steps.length === 0 ? (
          <div className="empty-hint">
            还没有事件到达。<br />点击「单步」或「自动播放」开始按用户旅程重放。
          </div>
        ) : (
          <div className="steps">
            {steps.map((s) => (
              <StepCard key={`${s.eventId}-${s.index}`} step={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
