import { SCENARIOS } from '../domain/scenarios';
import type { EventContract, RawEvent } from '../domain/types';

/**
 * 应用状态：到达队列 + 已处理前缀 + 撤销栈。
 * 执行器状态不单独存储 —— 由 foldEvents(contract, journey, applied) 纯推导，
 * 因此撤销/重做/刷新恢复都只是对 applied 前缀的重放。
 */
export interface AppState {
  scenarioId: string;
  contract: EventContract;
  /** 尚未到达的事件（可调整顺序、注入故障） */
  queue: RawEvent[];
  /** 已按到达顺序处理的事件 */
  applied: RawEvent[];
  /** 撤销栈（redo 用） */
  future: RawEvent[];
  playing: boolean;
}

export type FaultKind = 'duplicate' | 'privacy' | 'drop-session' | 'timewarp';

export type Action =
  | { type: 'load-scenario'; scenarioId: string }
  | { type: 'step' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'set-playing'; playing: boolean }
  | { type: 'move'; id: string; dir: -1 | 1 }
  | { type: 'remove-queued'; id: string }
  | { type: 'inject'; id: string; fault: FaultKind }
  | { type: 'contract'; contract: EventContract }
  | { type: 'hydrate'; state: AppState };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function initialStateFromScenario(scenarioId: string): AppState {
  const sc = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  return {
    scenarioId: sc.id,
    contract: sc.contract(),
    queue: clone(sc.events),
    applied: [],
    future: [],
    playing: false,
  };
}

function rid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2, 10)}`;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load-scenario':
      return initialStateFromScenario(action.scenarioId);
    case 'reset':
      return initialStateFromScenario(state.scenarioId);
    case 'step': {
      if (state.queue.length === 0) return state;
      const [head, ...rest] = state.queue;
      return { ...state, queue: rest, applied: [...state.applied, head], future: [] };
    }
    case 'undo': {
      if (state.applied.length === 0) return state;
      const last = state.applied[state.applied.length - 1];
      return { ...state, applied: state.applied.slice(0, -1), future: [last, ...state.future] };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [head, ...rest] = state.future;
      return { ...state, applied: [...state.applied, head], future: rest };
    }
    case 'set-playing':
      return { ...state, playing: action.playing };
    case 'move': {
      const i = state.queue.findIndex((e) => e.id === action.id);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= state.queue.length) return state;
      const queue = [...state.queue];
      [queue[i], queue[j]] = [queue[j], queue[i]];
      return { ...state, queue };
    }
    case 'remove-queued':
      return { ...state, queue: state.queue.filter((e) => e.id !== action.id) };
    case 'inject': {
      const i = state.queue.findIndex((e) => e.id === action.id);
      if (i < 0) return state;
      const e = state.queue[i];
      const queue = [...state.queue];
      switch (action.fault) {
        case 'duplicate':
          // 同一 eventId 的重复投递
          queue.splice(i + 1, 0, { ...e, id: `${e.id}-dup-${rid()}`, fields: { ...e.fields } });
          break;
        case 'privacy':
          queue[i] = { ...e, fields: { ...e.fields, email: 'leaked@example.com' } };
          break;
        case 'drop-session': {
          const fields = { ...e.fields };
          delete fields.sid;
          delete fields.session_id;
          queue[i] = { ...e, fields };
          break;
        }
        case 'timewarp':
          queue[i] = { ...e, timestamp: e.timestamp - 60_000 };
          break;
      }
      return { ...state, queue };
    }
    case 'contract':
      return { ...state, contract: action.contract };
    case 'hydrate':
      return action.state;
    default:
      return state;
  }
}

// —— 刷新恢复：localStorage 持久化 ——

const STORAGE_KEY = 'event-contract-lab/v1';

interface PersistedShape {
  scenarioId: string;
  contract: EventContract;
  queue: RawEvent[];
  applied: RawEvent[];
  future: RawEvent[];
}

function isPersisted(v: unknown): v is PersistedShape {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.scenarioId === 'string' &&
    typeof p.contract === 'object' &&
    Array.isArray(p.queue) &&
    Array.isArray(p.applied) &&
    Array.isArray(p.future)
  );
}

export function loadPersisted(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersisted(parsed)) return null;
    return { ...parsed, playing: false };
  } catch {
    return null;
  }
}

export function persist(state: AppState): void {
  try {
    const { scenarioId, contract, queue, applied, future } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenarioId, contract, queue, applied, future }));
  } catch {
    // 存储不可用（隐私模式等）时静默降级：功能不受影响，仅不恢复
  }
}
