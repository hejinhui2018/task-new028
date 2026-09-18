import { useStore, useReplayHotkeys } from '../state/store';

const FAULT_LABELS: Record<string, string> = {
  duplicate: '重复',
  reordered: '乱序',
  late: '迟到',
  pii: 'PII',
  'unknown-version': '未知版本',
  'strict-unknown-field': '契约外字段',
  'cross-session': '跨会话',
};

export function FaultTags({ faults }: { faults?: string[] }) {
  if (!faults || faults.length === 0) return null;
  return (
    <div className="fault-row">
      {faults.map((f) => (
        <span key={f} className="fault-tag">
          {FAULT_LABELS[f] ?? f}
        </span>
      ))}
    </div>
  );
}

export function Toolbar() {
  const {
    state,
    canUndo,
    canRedo,
    canStep,
    step,
    seek,
    setPlaying,
    setIntervalMs,
    reset,
    undo,
    redo,
  } = useStore();
  useReplayHotkeys();

  const total = state.queue.length;
  const progress = total === 0 ? 0 : Math.round((state.fedCount / total) * 100);

  return (
    <div className="toolbar">
      <div className="group">
        <button className="primary" onClick={step} disabled={!canStep || state.playing} title="喂入下一个到达事件（空格/回车）">
          ▶ 单步
        </button>
        {state.playing ? (
          <button onClick={() => setPlaying(false)}>⏸ 暂停</button>
        ) : (
          <button onClick={() => setPlaying(true)} disabled={!canStep} title="自动播放">
            ⏵ 自动播放
          </button>
        )}
        <button onClick={reset} disabled={state.fedCount === 0} title="回到起点重新重放（R）">
          ↺ 重置
        </button>
      </div>
      <div className="divider" />
      <div className="group">
        <button className="ghost" onClick={undo} disabled={!canUndo} title="撤销（Ctrl/Cmd+Z）">
          ⤺ 撤销
        </button>
        <button className="ghost" onClick={redo} disabled={!canRedo} title="重做（Ctrl/Cmd+Y）">
          ⤻ 重做
        </button>
      </div>
      <div className="divider" />
      <div className="progress-wrap">
        <input
          type="range"
          min={0}
          max={total}
          value={state.fedCount}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
          title="拖动以在到达序列上前进/后退"
        />
        <div className="progress-bar" style={{ width: 90 }}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="progress-text">
          {state.fedCount}/{total}
        </span>
      </div>
      <div className="spacer" style={{ flex: 1 }} />
      <div className="speed">
        速度
        <input
          type="range"
          min={300}
          max={3000}
          step={100}
          value={3300 - state.intervalMs}
          onChange={(e) => setIntervalMs(3300 - Number(e.target.value))}
        />
        <span className="mono small">{(state.intervalMs / 1000).toFixed(1)}s/步</span>
      </div>
      <span className="muted small">
        <span className="kbd">Space</span> 单步 <span className="kbd">R</span> 重置 <span className="kbd">⌘Z</span> 撤销
      </span>
    </div>
  );
}
