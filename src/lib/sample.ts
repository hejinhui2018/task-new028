import type { WeaveProject } from '../types';

export const SAMPLE_NAME = '破斜纹样稿（8 综 · 8 踏 · 32 经 · 24 纬）';

/**
 * 内置破斜纹样稿：
 * - 穿综：破斜顺序 1 3 5 7 2 4 6 8（0-based: 0 2 4 6 1 3 5 7），循环 4 次共 32 根经纱；
 * - 提综：4/4 斜纹，踏板 t 提升综框 t..t+3（mod 8）；
 * - 踏纹：顺踩 1..8，循环 3 次共 24 行纬纱。
 * 结果：经纬浮线最长均为 4，默认阈值 5 下无超限浮线。
 */
export function createSampleProject(): WeaveProject {
  const harnessCount = 8;
  const treadleCount = 8;

  const unit = [0, 2, 4, 6, 1, 3, 5, 7];
  const threading = Array.from({ length: 32 }, (_, i) => unit[i % unit.length]);

  const tieUp = Array.from({ length: harnessCount }, (_, h) =>
    Array.from({ length: treadleCount }, (_, t) => ((h - t + 8) % 8) < 4),
  );

  const treadling = Array.from({ length: 24 }, (_, i) => i % treadleCount);

  return {
    name: SAMPLE_NAME,
    harnessCount,
    treadleCount,
    threading,
    tieUp,
    treadling,
    warpColor: '#2b4c7e',
    weftColor: '#efe6d0',
    repeatX: 2,
    repeatY: 2,
    maxFloat: 5,
  };
}
