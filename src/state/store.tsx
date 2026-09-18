import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { ContractBundle, RawEvent, StepRecord, JourneySnapshot } from '../domain/types';
import { JourneyExecutor } from '../domain/executor';
import { DEFAULT_BUNDLE, DEMO_CASES } from '../data/cases';

// ── 状态 ──────────────────────────────────────────────────────

interface PlayState {
  bundle: ContractBundle;
  /** 按“到达顺序”排列的输入队列 */
  queue: RawEvent[];
  /** 已喂入执行器的事件数（单步 / 自动播放推进它） */
  fedCount: number;
  caseId: string;
  playing: boolean;
  /** 自动播放速度（ms/步） */
  intervalMs: number;
}

interface State extends PlayState {
  past: PlayState[];
  future: PlayState[];
}

type Action =
  | { type: 'LOAD_CASE'; caseId: string }
  | { type: 'SET_QUEUE'; queue: RawEvent[]; caseId?: string }
  | { type: 'STEP' }
  | { type: 'TICK' }
  | { type: 'SEEK'; fedCount: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_INTERVAL'; intervalMs: number }
  | { type: 'RESET' }
  | { type: 'SET_BUNDLE'; bundle: ContractBundle }
  | { type: 'UNDO' }
  | { type: 'REDO' };

const STORAGE_KEY = 'eventcontract-console-v1';

function presentOf(s: State): PlayState {
  const { past, future, ...present } = s;
  void past;
  void future;
  return present;
}

function checkpoint(s: State): State {
  const current = presentOf(s);
  return { ...s, past: [...s.past, current], future: [] };
}

function applyPresent(s: State, next: Partial<PlayState>): State {
  return { ...s, ...next };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD_CASE': {
      const demo = DEMO_CASES.find((c) => c.id === action.caseId) ?? DEMO_CASES[0];
      const next: PlayState = {
        bundle: DEFAULT_BUNDLE,
        queue: structuredClone(demo.events),
        fedCount: 0,
        caseId: demo.id,
        playing: false,
        intervalMs: state.intervalMs,
      };
      return { ...checkpoint(state), ...next };
    }
    case 'SET_QUEUE':
      return applyPresent(checkpoint(state), {
        queue: action.queue,
        fedCount: 0,
        playing: false,
        ...(action.caseId ? { caseId: action.caseId } : {}),
      });
    case 'STEP':
      if (state.fedCount >= state.queue.length) return { ...state, playing: false };
      return applyPresent(checkpoint(state), { fedCount: state.fedCount + 1 });
    case 'TICK':
      if (state.fedCount >= state.queue.length) return { ...state, playing: false };
      // 自动播放的连续 tick 不逐个写历史
      return applyPresent(state, { fedCount: state.fedCount + 1 });
    case 'SEEK': {
      const fedCount = Math.max(0, Math.min(action.fedCount, state.queue.length));
      if (fedCount === state.fedCount) return state;
      return applyPresent(checkpoint(state), { fedCount, playing: false });
    }
    case 'SET_PLAYING':
      return applyPresent(state, {
        playing: action.playing && state.fedCount < state.queue.length,
      });
    case 'SET_INTERVAL':
      return applyPresent(state, { intervalMs: action.intervalMs });
    case 'RESET':
      return applyPresent(checkpoint(state), { fedCount: 0, playing: false });
    case 'SET_BUNDLE':
      return applyPresent(checkpoint(state), {
        bundle: action.bundle,
        fedCount: 0,
        playing: false,
      });
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...previous,
        playing: false,
        past: state.past.slice(0, -1),
        future: [presentOf(state), ...state.future],
      };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...next,
        playing: false,
        past: [...state.past, presentOf(state)],
        future: rest,
      };
    }
  }
}

function initialState(): State {
  const first = DEMO_CASES[0];
  return {
    bundle: DEFAULT_BUNDLE,
    queue: structuredClone(first.events),
    fedCount: 0,
    caseId: first.id,
    playing: false,
    intervalMs: 1200,
    past: [],
    future: [],
  };
}

function restoreState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const saved = JSON.parse(raw) as PlayState;
    if (!saved.bundle || !Array.isArray(saved.queue)) return initialState();
    return {
      bundle: saved.bundle,
      queue: saved.queue,
      fedCount: Math.min(saved.fedCount ?? 0, saved.queue.length),
      caseId: saved.caseId ?? DEMO_CASES[0].id,
      playing: false, // 刷新后不自动播放
      intervalMs: saved.intervalMs ?? 1200,
      past: [],
      future: [],
    };
  } catch {
    return initialState();
  }
}

// ── 派生态：结论永远由执行器从状态重放得出 ─────────────────────

function replayPrefix(bundle: ContractBundle, queue: RawEvent[], fedCount: number): {
  steps: StepRecord[];
  snapshot: JourneySnapshot;
} {
  const executor = new JourneyExecutor(bundle);
  const steps: StepRecord[] = [];
  for (const ev of queue.slice(0, fedCount)) {
    steps.push(...executor.ingest(ev));
  }
  // 全部到达后封口：不会再来的前置阶段让滞留缓冲项失效
  if (fedCount >= queue.length) {
    steps.push(...executor.seal());
  }
  return { steps, snapshot: executor.snapshot() };
}

// ── Context ───────────────────────────────────────────────────

interface StoreValue {
  state: State;
  steps: StepRecord[];
  snapshot: JourneySnapshot;
  canUndo: boolean;
  canRedo: boolean;
  canStep: boolean;
  loadCase: (caseId: string) => void;
  setQueue: (queue: RawEvent[], caseId?: string) => void;
  step: () => void;
  seek: (n: number) => void;
  setPlaying: (p: boolean) => void;
  setIntervalMs: (n: number) => void;
  reset: () => void;
  setBundle: (b: ContractBundle) => void;
  undo: () => void;
  redo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, restoreState);

  const { steps, snapshot } = useMemo(
    () => replayPrefix(state.bundle, state.queue, state.fedCount),
    [state.bundle, state.queue, state.fedCount],
  );

  // 刷新恢复：持久化当前会话（不含撤销栈）
  useEffect(() => {
    const present = presentOf(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(present));
    } catch {
      // 存储不可用时静默降级（应用仍可完整使用）
    }
  }, [state]);

  // 自动播放
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state.playing) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    if (state.fedCount >= state.queue.length) {
      dispatch({ type: 'SET_PLAYING', playing: false });
      return;
    }
    timerRef.current = window.setInterval(() => {
      dispatch({ type: 'TICK' });
    }, state.intervalMs);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [state.playing, state.fedCount, state.queue.length, state.intervalMs]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      steps,
      snapshot,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      canStep: state.fedCount < state.queue.length,
      loadCase: (caseId) => dispatch({ type: 'LOAD_CASE', caseId }),
      setQueue: (queue, caseId) => dispatch({ type: 'SET_QUEUE', queue, caseId }),
      step: () => dispatch({ type: 'STEP' }),
      seek: (n) => dispatch({ type: 'SEEK', fedCount: n }),
      setPlaying: (p) => dispatch({ type: 'SET_PLAYING', playing: p }),
      setIntervalMs: (n) => dispatch({ type: 'SET_INTERVAL', intervalMs: n }),
      reset: () => dispatch({ type: 'RESET' }),
      setBundle: (b) => dispatch({ type: 'SET_BUNDLE', bundle: b }),
      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
    }),
    [state, steps, snapshot],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}

// 便捷 hook：键盘快捷键
export function useReplayHotkeys() {
  const { step, canStep, undo, redo, reset } = useStore();
  const stable = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      if ((e.key === 'Enter' || e.key === ' ') && canStep) {
        e.preventDefault();
        step();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === 'r') {
        reset();
      }
    },
    [step, canStep, undo, redo, reset],
  );
  useEffect(() => {
    window.addEventListener('keydown', stable);
    return () => window.removeEventListener('keydown', stable);
  }, [stable]);
}
