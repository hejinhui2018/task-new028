import type { WeaveProject } from '../types';

export const REPEAT_MIN = 1;
export const REPEAT_MAX = 4;
export const FLOAT_MIN = 1;
export const FLOAT_MAX = 24;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

export type ProjectAction =
  | { type: 'set-threading'; warp: number; harness: number }
  | { type: 'toggle-tieup'; harness: number; treadle: number }
  | { type: 'set-treadling'; pick: number; treadle: number }
  | { type: 'set-warp-color'; color: string }
  | { type: 'set-weft-color'; color: string }
  | { type: 'set-repeat-x'; value: number }
  | { type: 'set-repeat-y'; value: number }
  | { type: 'set-max-float'; value: number }
  | { type: 'restore'; project: WeaveProject };

/** 样稿编辑：所有修改都产生新对象，组织图等派生数据由调用方重新计算 */
export function projectReducer(state: WeaveProject, action: ProjectAction): WeaveProject {
  switch (action.type) {
    case 'set-threading': {
      if (action.warp < 0 || action.warp >= state.threading.length) return state;
      if (action.harness < 0 || action.harness >= state.harnessCount) return state;
      if (state.threading[action.warp] === action.harness) return state;
      const threading = state.threading.slice();
      threading[action.warp] = action.harness;
      return { ...state, threading };
    }
    case 'toggle-tieup': {
      if (action.harness < 0 || action.harness >= state.harnessCount) return state;
      if (action.treadle < 0 || action.treadle >= state.treadleCount) return state;
      const tieUp = state.tieUp.map((row, h) =>
        h === action.harness ? row.map((v, t) => (t === action.treadle ? !v : v)) : row,
      );
      return { ...state, tieUp };
    }
    case 'set-treadling': {
      if (action.pick < 0 || action.pick >= state.treadling.length) return state;
      if (action.treadle < 0 || action.treadle >= state.treadleCount) return state;
      if (state.treadling[action.pick] === action.treadle) return state;
      const treadling = state.treadling.slice();
      treadling[action.pick] = action.treadle;
      return { ...state, treadling };
    }
    case 'set-warp-color':
      return { ...state, warpColor: action.color };
    case 'set-weft-color':
      return { ...state, weftColor: action.color };
    case 'set-repeat-x':
      return { ...state, repeatX: clamp(action.value, REPEAT_MIN, REPEAT_MAX) };
    case 'set-repeat-y':
      return { ...state, repeatY: clamp(action.value, REPEAT_MIN, REPEAT_MAX) };
    case 'set-max-float':
      return { ...state, maxFloat: clamp(action.value, FLOAT_MIN, FLOAT_MAX) };
    case 'restore':
      return action.project;
  }
}
