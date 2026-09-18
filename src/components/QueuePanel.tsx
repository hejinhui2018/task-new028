import { BASE_TS } from '../domain/scenarios';
import type { RawEvent } from '../domain/types';
import type { FaultKind } from '../state/store';

interface Props {
  queue: RawEvent[];
  onMove: (id: string, dir: -1 | 1) => void;
  onInject: (id: string, fault: FaultKind) => void;
  onRemove: (id: string) => void;
}

const FAULTS: { kind: FaultKind; label: string; title: string }[] = [
  { kind: 'duplicate', label: '重复', title: '注入一次同 eventId 的重复投递' },
  { kind: 'privacy', label: '隐私', title: '注入禁采字段 email' },
  { kind: 'drop-session', label: '抹会话', title: '抹除会话字段 sid / session_id' },
  { kind: 'timewarp', label: '回拨', title: '时间戳回拨 60 秒' },
];

export function QueuePanel({ queue, onMove, onInject, onRemove }: Props) {
  return (
    <div className="panel grow">
      <h2>到达队列（{queue.length}）</h2>
      {queue.length === 0 && <p className="hint">队列已空。可撤销、重置或切换场景。</p>}
      <div className="queue">
        {queue.map((e, i) => (
          <div className="qcard" key={e.id}>
            <div className="qhead">
              <span className="seq">#{i + 1}</span>
              <span className={`ver ${e.version}`}>{e.version}</span>
              <span className="mono name">{e.name}</span>
              <span className="dim">{(e.timestamp - BASE_TS) / 1000 >= 0 ? '+' : ''}{(e.timestamp - BASE_TS) / 1000}s</span>
              <span className="spacer" />
              <button className="mini" disabled={i === 0} title="上移（提前到达）" onClick={() => onMove(e.id, -1)}>↑</button>
              <button className="mini" disabled={i === queue.length - 1} title="下移（推迟到达）" onClick={() => onMove(e.id, 1)}>↓</button>
              <button className="mini danger" title="从队列移除" onClick={() => onRemove(e.id)}>×</button>
            </div>
            <div className="qbody">
              <span className="dim mono">eventId={e.eventId}</span>
              <span className="fields mono" title={JSON.stringify(e.fields, null, 2)}>
                {JSON.stringify(e.fields)}
              </span>
            </div>
            <div className="qfaults">
              <span className="dim">故障注入：</span>
              {FAULTS.map((f) => (
                <button key={f.kind} className="mini warn" title={f.title} onClick={() => onInject(e.id, f.kind)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
