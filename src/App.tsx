import { useEffect, useMemo, useReducer } from 'react';
import { JOURNEY } from './domain/contract';
import { foldEvents } from './domain/executor';
import { SCENARIOS } from './domain/scenarios';
import { initialStateFromScenario, loadPersisted, persist, reducer } from './state/store';
import { ContractPanel } from './components/ContractPanel';
import { JourneyPanel } from './components/JourneyPanel';
import { QueuePanel } from './components/QueuePanel';
import { LogPanel } from './components/LogPanel';
import { ImpactPanel } from './components/ImpactPanel';

const STATUS_CHIP = {
  running: { cls: 'run', text: '进行中' },
  completed: { cls: 'ok', text: '旅程完成' },
  failed: { cls: 'bad', text: '旅程断裂' },
} as const;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    if (typeof window === 'undefined') return initialStateFromScenario(SCENARIOS[0].id);
    return loadPersisted() ?? initialStateFromScenario(SCENARIOS[0].id);
  });

  // 执行器状态纯推导：契约或已处理前缀变化即重放
  const exec = useMemo(
    () => foldEvents(state.contract, JOURNEY, state.applied),
    [state.contract, state.applied],
  );

  const scenario = SCENARIOS.find((s) => s.id === state.scenarioId) ?? SCENARIOS[0];
  const chip = STATUS_CHIP[exec.status];

  // 刷新恢复：任何状态变化都持久化
  useEffect(() => {
    persist(state);
  }, [state]);

  // 自动播放
  useEffect(() => {
    if (!state.playing) return;
    if (state.queue.length === 0) {
      dispatch({ type: 'set-playing', playing: false });
      return;
    }
    const t = setInterval(() => dispatch({ type: 'step' }), 900);
    return () => clearInterval(t);
  }, [state.playing, state.queue.length]);

  return (
    <div className="app">
      <header className="header">
        <div className="title">
          <h1>EventContract 埋点迁移验收台</h1>
          <span className={`chip ${chip.cls}`}>{chip.text}</span>
        </div>
        <div className="controls">
          <select
            value={state.scenarioId}
            onChange={(e) => dispatch({ type: 'load-scenario', scenarioId: e.target.value })}
            title="选择演示场景"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button onClick={() => dispatch({ type: 'step' })} disabled={state.queue.length === 0}>
            单步
          </button>
          {state.playing ? (
            <button className="warn" onClick={() => dispatch({ type: 'set-playing', playing: false })}>
              暂停
            </button>
          ) : (
            <button onClick={() => dispatch({ type: 'set-playing', playing: true })} disabled={state.queue.length === 0}>
              自动播放
            </button>
          )}
          <button onClick={() => dispatch({ type: 'undo' })} disabled={state.applied.length === 0}>
            撤销
          </button>
          <button onClick={() => dispatch({ type: 'redo' })} disabled={state.future.length === 0}>
            重做
          </button>
          <button className="danger" onClick={() => dispatch({ type: 'reset' })}>
            重置
          </button>
        </div>
      </header>

      <div className="scenario-banner">
        <strong>{scenario.title}</strong>
        <span>{scenario.summary}</span>
        <ul>
          {scenario.learnings.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>

      <main className="main">
        <div className="col">
          <ContractPanel contract={state.contract} onChange={(c) => dispatch({ type: 'contract', contract: c })} />
        </div>
        <div className="col">
          <JourneyPanel exec={exec} journey={JOURNEY} />
          <QueuePanel
            queue={state.queue}
            onMove={(id, dir) => dispatch({ type: 'move', id, dir })}
            onInject={(id, fault) => dispatch({ type: 'inject', id, fault })}
            onRemove={(id) => dispatch({ type: 'remove-queued', id })}
          />
        </div>
        <div className="col">
          <ImpactPanel exec={exec} journey={JOURNEY} />
          <LogPanel exec={exec} journey={JOURNEY} />
        </div>
      </main>
    </div>
  );
}
