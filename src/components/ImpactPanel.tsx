import type { ExecutorState, JourneyDef } from '../domain/types';

const ATTR_TEXT = { intact: '完整', degraded: '降级', broken: '断裂' } as const;

export function ImpactPanel({ exec, journey }: { exec: ExecutorState; journey: JourneyDef }) {
  const { session, experiment, attribution } = exec;
  return (
    <div className="panel">
      <h2>影响台账</h2>

      <section className="impact-card">
        <h3>会话关联</h3>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-num">{session.sessions.length}</div>
            <div className="stat-label">会话数</div>
          </div>
          <div className="stat">
            <div className={`stat-num ${session.switches > 0 ? 'warn-text' : ''}`}>{session.switches}</div>
            <div className="stat-label">会话切换</div>
          </div>
          <div className="stat">
            <div className={`stat-num ${session.unknownEvents > 0 ? 'warn-text' : ''}`}>{session.unknownEvents}</div>
            <div className="stat-label">未知会话事件</div>
          </div>
        </div>
        <div className="dim">当前会话：{session.current ?? '（无）'}</div>
      </section>

      <section className="impact-card">
        <h3>实验分组</h3>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-num">{experiment.variant ?? '—'}</div>
            <div className="stat-label">当前变体</div>
          </div>
          <div className="stat">
            <div className={`stat-num ${experiment.missingEvents > 0 ? 'warn-text' : ''}`}>{experiment.missingEvents}</div>
            <div className="stat-label">缺变体事件</div>
          </div>
          <div className="stat">
            <div className={`stat-num ${experiment.conflicts > 0 ? 'bad-text' : ''}`}>{experiment.conflicts}</div>
            <div className="stat-label">串组次数</div>
          </div>
        </div>
      </section>

      <section className="impact-card">
        <h3>
          转化归因 <span className={`attr-chip ${attribution.status}`}>{ATTR_TEXT[attribution.status]}</span>
        </h3>
        {attribution.chain.length === 0 && <div className="dim">尚无已接受的旅程步骤。</div>}
        {attribution.chain.length > 0 && (
          <table className="chain">
            <thead>
              <tr>
                <th>步骤</th>
                <th>用户</th>
                <th>会话</th>
                <th>变体</th>
                <th>问题</th>
              </tr>
            </thead>
            <tbody>
              {attribution.chain.map((l) => {
                const step = journey.steps.find((s) => s.id === l.stepId);
                return (
                  <tr key={l.stepId} className={l.problems.length > 0 ? 'has-problems' : ''}>
                    <td>{step?.title ?? l.stepId}</td>
                    <td className="mono">{l.userId ?? '✗'}</td>
                    <td className="mono">{l.sessionId ?? '✗'}</td>
                    <td className="mono">{l.variant ?? '✗'}</td>
                    <td>{l.problems.length === 0 ? '✓' : l.problems.join('；')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="impact-card">
        <h3>下游事件流（{exec.downstream.length}）</h3>
        <p className="dim">仅被接受的事件进入下游；阻断事件从未到达这里（已拦截 {exec.privacyBlocks} 起）。</p>
        {exec.downstream.map((a, i) => (
          <div className="dsevent" key={i}>
            <span className={`ver ${a.sourceVersion}`}>{a.sourceVersion}</span>
            <span className="mono name">{a.name}</span>
            <span className="fields mono" title={JSON.stringify(a.fields, null, 2)}>
              {JSON.stringify(a.fields)}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
