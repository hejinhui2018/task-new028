import { describe, expect, it } from 'vitest';
import { computeDrawdown, detectFloats, expandDrawdown, runCells, runSegments } from './weave';
import type { FloatRun } from './weave';
import { createSampleProject } from './sample';

/** 用字符画构造组织图：X = 经组织点，. = 纬组织点 */
function dd(rows: string[]): boolean[][] {
  return rows.map((r) => [...r].map((c) => c === 'X'));
}

describe('detectFloats 经纬浮线检测', () => {
  it('检测经向浮线（正面/背面）的位置、方向与长度', () => {
    const d = dd([
      'X..',
      'X.X',
      'X.X',
      'X.X',
      '..X',
    ]);
    const issues = detectFloats(d, 3);
    // 第 0 列：X X X X . → 经向正面浮线 4（行 0 起）
    // 第 1 列：. . . . . → 经向背面浮线 5
    // 第 2 列：. X X X X → 经向正面浮线 4（行 1 起）
    expect(issues).toHaveLength(3);
    expect(issues.find((i) => i.col === 0)).toMatchObject({
      direction: 'warp',
      side: 'face',
      row: 0,
      length: 4,
    });
    expect(issues.find((i) => i.col === 1)).toMatchObject({
      direction: 'warp',
      side: 'back',
      row: 0,
      length: 5,
    });
    expect(issues.find((i) => i.col === 2)).toMatchObject({
      direction: 'warp',
      side: 'face',
      row: 1,
      length: 4,
    });
  });

  it('检测纬向浮线（正面/背面）', () => {
    const d = dd([
      'X....X',
      'XXXXXX',
      'X.XX.X',
    ]);
    const issues = detectFloats(d, 3);
    expect(issues).toHaveLength(2);
    // 第 0 行：第 1–4 列连续纬组织点 → 纬向正面浮线 4
    expect(issues.find((i) => i.direction === 'weft' && i.side === 'face')).toMatchObject({
      row: 0,
      col: 1,
      length: 4,
    });
    // 第 1 行：整行经组织点 → 纬纱沉在背面 → 纬向背面浮线 6
    expect(issues.find((i) => i.direction === 'weft' && i.side === 'back')).toMatchObject({
      row: 1,
      col: 0,
      length: 6,
    });
  });

  it('阈值边界：长度等于 maxFloat 不报，超过才报', () => {
    const d = dd(['....']);
    expect(detectFloats(d, 4)).toHaveLength(0);
    expect(detectFloats(d, 3)).toHaveLength(1);
  });

  it('纬向浮线跨循环边界合并（wrapX）', () => {
    const d = dd(['..XX.']);
    // 线性：正面浮线被边界拆成 2 + 1 两段，均不超过阈值 2
    expect(detectFloats(d, 2).filter((i) => i.direction === 'weft' && i.side === 'face')).toHaveLength(0);
    // 循环：合并为一条长度 3、起点第 4 列、跨边界的浮线
    const wrapped = detectFloats(d, 2, { wrapX: true });
    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]).toMatchObject({ direction: 'weft', side: 'face', col: 4, length: 3, wraps: true });
  });

  it('经向浮线跨循环边界合并（wrapY）', () => {
    const d = dd(['XX', 'X.', '.X', 'XX']);
    // 线性：第 0 列 X X . X → 最长 2，不超阈值
    expect(detectFloats(d, 2)).toHaveLength(0);
    // 循环：第 0 列 行3+行0+行1 合并为长度 3
    const wrapped = detectFloats(d, 2, { wrapY: true });
    const warp = wrapped.find((i) => i.direction === 'warp' && i.col === 0);
    expect(warp).toMatchObject({ row: 3, length: 3, wraps: true });
  });

  it('整行/整列同一组织时按整圈长度上报并标记 wraps', () => {
    const d = dd(['...', '...', '...']);
    const issues = detectFloats(d, 2, { wrapX: true, wrapY: true });
    expect(issues.filter((i) => i.direction === 'weft')).toHaveLength(3);
    expect(issues.filter((i) => i.direction === 'warp')).toHaveLength(3);
    expect(issues.every((i) => i.wraps && i.length === 3)).toBe(true);
  });

  it('runCells / runSegments 跨边界时取模回绕并拆段', () => {
    const run: FloatRun = { direction: 'weft', side: 'face', row: 0, col: 4, length: 3, wraps: true };
    expect(runCells(run, 5, 1)).toEqual([
      { row: 0, col: 4 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(runSegments(run, 5, 1)).toEqual([
      { row: 0, col: 4, rows: 1, cols: 1 },
      { row: 0, col: 0, rows: 1, cols: 2 },
    ]);
  });

  it('内置样稿默认阈值下无超限浮线；调低阈值可检出全部 4 格浮线', () => {
    const p = createSampleProject();
    const d = expandDrawdown(computeDrawdown(p), p.repeatX, p.repeatY);
    expect(detectFloats(d, p.maxFloat, { wrapX: true, wrapY: true })).toHaveLength(0);
    const strict = detectFloats(d, 3, { wrapX: true, wrapY: true });
    expect(strict.length).toBeGreaterThan(0);
    expect(strict.every((i) => i.length === 4)).toBe(true);
  });
});
