import { useStore } from '../state/store';
import { moveItem, reverseArrivals } from '../domain/faults';
import type { InjectedFault, RawEvent } from '../domain/types';
import { FaultTags } from './Toolbar';

function QueueRow({ ev, index, fed, onMove }: {
  ev: RawEvent;
  index: number;
  fed: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const { state } = useStore();
  return (
    <div className={`queue-item${fed ? ' fed' : ''}`}>
      <div className="arrows">
        <button className="sm" disabled={index === 0 || fed} onClick={() => onMove(index, index - 1)} title="提前到达">
          ▲
        </button>
        <button className="sm" disabled={index === state.queue.length - 1 || fed} onClick={() => onMove(index, index + 1)} title="延后到达">
          ▼
        </button>
      </div>
      <span className={`ver-tag ${ev.source === 'v1-sdk' ? 'v1' : 'v2'}`}>
        {ev.source === 'v1-sdk' ? 'v1' : 'v2'}
      </span>
      <div className="meta">
        <div className="name">{ev.name}</div>
        <div className="sub">
          {ev.id} · +{ev.arrivalDelayMs ?? 0}ms{ev.sessionId ? ` · ${ev.sessionId}` : ''}
        </div>
        <FaultTags faults={ev.faults} />
      </div>
    </div>
  );
}

export function EventQueue({ onFaultMenu }: { onFaultMenu: () => void }) {
  const { state, setQueue } = useStore();

  const handleMove = (from: number, to: number) => {
    setQueue(moveItem(state.queue, from, to));
  };

  return (
    <div className="panel">
      <h2>
        到达队列
        <span className="muted small">（按此顺序“到达”执行器，▲▼ 调整）</span>
      </h2>
      <div className="body">
        <div className="row" style={{ marginBottom: 9 }}>
          <button className="sm" onClick={onFaultMenu}>⚡ 故障注入</button>
          <button
            className="sm"
            disabled={state.fedCount > 0}
            onClick={() => setQueue(reverseArrivals(state.queue))}
            title={state.fedCount > 0 ? '重放中不可调整，请先重置或撤销' : '把到达顺序整体反转'}
          >
            ⇅ 整体倒序
          </button>
          <button
            className="sm danger"
            disabled={state.fedCount > 0}
            onClick={() =>
              setQueue(
                state.queue.map((ev): RawEvent => ({
                  ...ev,
                  arrivalDelayMs: 200,
                  faults: (ev.faults ?? []).filter((f: InjectedFault) => f === 'duplicate'),
                })),
              )
            }
            title="清除乱序/迟到/PII 等注入，恢复案例默认顺序"
          >
            清除注入
          </button>
        </div>
        {state.queue.map((ev, i) => (
          <QueueRow key={`${ev.id}-${i}`} ev={ev} index={i} fed={i < state.fedCount} onMove={handleMove} />
        ))}
        {state.queue.length === 0 && <div className="empty-hint">队列为空，请导入事件或选择案例</div>}
      </div>
    </div>
  );
}
