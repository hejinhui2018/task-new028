import type { WeaveProject } from '../types';

export const STORAGE_KEY = 'weave-studio:project:v1';

/** 校验并规范化一份样稿数据；非法时返回 null */
export function validateProject(x: unknown): WeaveProject | null {
  if (typeof x !== 'object' || x === null) return null;
  const p = x as Record<string, unknown>;
  const { harnessCount, treadleCount, threading, tieUp, treadling } = p as {
    harnessCount?: unknown;
    treadleCount?: unknown;
    threading?: unknown;
    tieUp?: unknown;
    treadling?: unknown;
  };

  if (typeof harnessCount !== 'number' || typeof treadleCount !== 'number') return null;
  if (!Number.isInteger(harnessCount) || !Number.isInteger(treadleCount)) return null;
  if (harnessCount < 1 || harnessCount > 64 || treadleCount < 1 || treadleCount > 64) return null;

  if (!Array.isArray(threading) || threading.length === 0) return null;
  if (!threading.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < harnessCount)) return null;

  if (!Array.isArray(treadling) || treadling.length === 0) return null;
  if (!treadling.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < treadleCount)) return null;

  if (!Array.isArray(tieUp) || tieUp.length !== harnessCount) return null;
  for (const row of tieUp) {
    if (!Array.isArray(row) || row.length !== treadleCount) return null;
    if (!row.every((v) => typeof v === 'boolean')) return null;
  }

  const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : dflt;

  return {
    name: typeof p.name === 'string' ? p.name : '未命名样稿',
    harnessCount,
    treadleCount,
    threading: [...(threading as number[])],
    tieUp: (tieUp as boolean[][]).map((row) => [...row]),
    treadling: [...(treadling as number[])],
    warpColor: typeof p.warpColor === 'string' ? p.warpColor : '#2b4c7e',
    weftColor: typeof p.weftColor === 'string' ? p.weftColor : '#efe6d0',
    repeatX: clampInt(p.repeatX, 1, 4, 1),
    repeatY: clampInt(p.repeatY, 1, 4, 1),
    maxFloat: clampInt(p.maxFloat, 1, 24, 5),
  };
}

/** 从浏览器本地存储读取样稿；无存档或数据非法时返回 null */
export function loadProject(): WeaveProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return validateProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 保存样稿到浏览器本地存储 */
export function saveProject(p: WeaveProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 存储不可用（如隐私模式）时静默失败，不影响编辑
  }
}

export function clearProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
