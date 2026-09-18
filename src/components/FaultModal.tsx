import { useState } from 'react';
import { useStore } from '../state/store';
import {
  injectCrossSession,
  injectDuplicates,
  injectLate,
  injectPiiField,
  shuffleArrivals,
} from '../domain/faults';
import type { RawEvent } from '../domain/types';

type Mode = 'duplicates' | 'late' | 'pii' | 'cross-session' | 'shuffle';

const MODE_INFO: Record<Mode, { label: string; desc: string }> = {
  duplicates: { label: '注入重复上报', desc: '为勾选事件追加同 ID 的重试副本，验证幂等去重' },
  late: { label: '注入迟到', desc: '把勾选事件的到达间隔加大（默认 6000ms，越过 3000ms 等待窗口）' },
  pii: { label: '注入禁采字段', desc: '为勾选事件加入 phone / email 字段，验证入口剥离' },
  'cross-session': { label: '注入跨会话副本', desc: '复制勾选事件并替换 sessionId，验证会话关联冲突' },
  shuffle: { label: '随机打乱到达顺序', desc: '无需勾选；确定性洗牌全部事件的到达顺序' },
};

export function FaultModal({ onClose }: { onClose: () => void }) {
  const { state, setQueue } = useStore();
  const [mode, setMode] = useState<Mode>('duplicates');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [delay, setDelay] = useState(6000);

  const toggle = (i: number) => {
    const next = new Set(picked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setPicked(next);
  };

  const apply = () => {
    const indices = [...picked].sort((a, b) => a - b);
    let q: RawEvent[] = state.queue;
    switch (mode) {
      case 'duplicates':
        q = injectDuplicates(q, indices.length ? indices : undefined);
        break;
      case 'late':
        q = injectLate(q, indices, delay);
        break;
      case 'pii':
        q = injectPiiField(q, indices);
        break;
      case 'cross-session':
        q = injectCrossSession(q, indices);
        break;
      case 'shuffle':
        q = shuffleArrivals(q);
        break;
    }
    setQueue(q);
    onClose();
  };

  const needsPick = mode !== 'shuffle';

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header>
          <h3>⚡ 故障注入</h3>
          <span className="muted small">纯函数作用于队列副本，可撤销</span>
        </header>
        <div className="modal-body">
          <div className="tabs">
            {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); setPicked(new Set()); }}>
                {MODE_INFO[m].label}
              </button>
            ))}
          </div>
          <div className="small" style={{ color: 'var(--text-dim)', marginBottom: 8 }}>{MODE_INFO[mode].desc}</div>

          {mode === 'late' && (
            <div className="row" style={{ marginBottom: 10 }}>
              到达间隔
              <input type="number" min={500} step={500} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
              ms（旅程等待窗口 {state.bundle.journey.maxWaitMs}ms）
            </div>
          )}

          {needsPick && (
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>
                {picked.size === 0 ? '不勾选则作用于全部事件' : `已勾选 ${picked.size} 个`}
              </div>
              {state.queue.map((ev, i) => (
                <label key={`${ev.id}-${i}`} className="queue-item" style={{ cursor: 'pointer', marginBottom: 5 }}>
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                  <span className={`ver-tag ${ev.source === 'v1-sdk' ? 'v1' : 'v2'}`}>
                    {ev.source === 'v1-sdk' ? 'v1' : 'v2'}
                  </span>
                  <div className="meta">
                    <div className="name">{ev.name}</div>
                    <div className="sub">{ev.id}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <footer>
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={apply}>注入到队列</button>
        </footer>
      </div>
    </div>
  );
}
