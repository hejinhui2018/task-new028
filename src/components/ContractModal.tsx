import { useState } from 'react';
import { useStore } from '../state/store';
import type { FieldRule } from '../domain/types';

function RuleView({ rule }: { rule: FieldRule }) {
  switch (rule.kind) {
    case 'rename':
      return <span className="badge">改名 <b>{rule.from}</b> → <b>{rule.to}</b></span>;
    case 'split':
      return (
        <span className="badge">
          拆分 <b>{rule.from}</b>（'{rule.delimiter}'）→{' '}
          {rule.to.map((t) => `${t.field}#${t.part + 1}`).join('、')}
        </span>
      );
    case 'dropPii':
      return <span className="badge denied">丢弃 PII <b>{rule.from}</b>（不伪哈希）</span>;
    case 'gap':
      return <span className="badge gap">缺口 <b>{rule.to}</b>（v1 无来源，不伪造）</span>;
  }
}

export function ContractModal({ onClose }: { onClose: () => void }) {
  const { state, setBundle } = useStore();
  const [tab, setTab] = useState<'view' | 'json'>('view');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(state.bundle, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.protocols || !parsed.migration || !parsed.privacy || !parsed.journey) {
        setJsonError('必须包含 protocols / migration / privacy / journey 四个顶层键');
        return;
      }
      setBundle(parsed);
      onClose();
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  const { bundle } = state;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header>
          <h3>协议契约、字段改名 / 拆分 / 兼容规则</h3>
          <div style={{ flex: 1 }} />
          <button className={`sm ${tab === 'view' ? 'primary' : ''}`} onClick={() => setTab('view')}>结构化视图</button>
          <button className={`sm ${tab === 'json' ? 'primary' : ''}`} onClick={() => { setJsonText(JSON.stringify(bundle, null, 2)); setJsonError(null); setTab('json'); }}>JSON 编辑</button>
        </header>
        <div className="modal-body contract-editor">
          {tab === 'view' ? (
            <div>
              {bundle.protocols.map((p) => (
                <div key={p.version}>
                  <div className="section-title">
                    v{p.version} · {p.label} · {p.strict ? '严格模式（契约外字段阻断）' : '宽松模式（契约外字段告警）'}
                  </div>
                  <table>
                    <thead>
                      <tr><th style={{ width: 170 }}>事件</th><th>必填</th><th>可选</th></tr>
                    </thead>
                    <tbody>
                      {p.events.map((ec) => (
                        <tr key={ec.name}>
                          <td className="mono"><b>{ec.name}</b><div className="muted small">{ec.description}</div></td>
                          <td>
                            <div className="badge-list">
                              {ec.required.map((f) => <span key={f} className="badge req">{f}</span>)}
                              {ec.required.length === 0 && <span className="muted small">—</span>}
                            </div>
                          </td>
                          <td>
                            <div className="badge-list">
                              {ec.optional.map((f) => <span key={f} className="badge">{f}</span>)}
                              {ec.optional.length === 0 && <span className="muted small">—</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="section-title">
                v{bundle.migration.fromVersion} → v{bundle.migration.toVersion} 迁移规则
              </div>
              {bundle.migration.events.map((m) => (
                <div key={m.fromEvent} className="link-card">
                  <div className="lk-title">
                    <span className="mono">{m.fromEvent}</span>
                    <span style={{ color: 'var(--accent)' }}>→</span>
                    <span className="mono">{m.toEvent}</span>
                  </div>
                  <div className="badge-list">{m.fieldRules.map((r, i) => <RuleView key={i} rule={r} />)}</div>
                </div>
              ))}

              <div className="section-title">隐私契约（红线，先于一切处理）</div>
              <div className="link-card">
                <div className="lk-title">禁采事件（整条拦截，不落下游/缓冲）</div>
                <div className="badge-list">{bundle.privacy.deniedEvents.map((e) => <span key={e} className="badge denied">{e}</span>)}</div>
              </div>
              <div className="link-card">
                <div className="lk-title">禁采字段（入口剥离，不掩码、不伪哈希）</div>
                <div className="badge-list">{bundle.privacy.deniedFields.map((f) => <span key={f} className="badge denied">{f}</span>)}</div>
              </div>

              <div className="section-title">旅程与窗口</div>
              <div className="small muted">
                {bundle.journey.stages.map((s, i) => (
                  <span key={s.key}>
                    <b>{s.label}</b> <span className="mono">({s.event})</span>
                    {i < bundle.journey.stages.length - 1 ? ' → ' : ''}
                  </span>
                ))}
                ；乱序等待窗口 {bundle.journey.maxWaitMs}ms；去重窗口 {bundle.journey.dedupeWindowMs}ms
              </div>
            </div>
          ) : (
            <div>
              <textarea
                style={{ width: '100%', height: 460 }}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
              />
              {jsonError && <div className="error-text">契约 JSON 无效：{jsonError}</div>}
            </div>
          )}
        </div>
        <footer>
          {tab === 'json' && <button className="primary" onClick={applyJson}>应用契约（重置重放）</button>}
          <button onClick={onClose}>关闭</button>
        </footer>
      </div>
    </div>
  );
}
