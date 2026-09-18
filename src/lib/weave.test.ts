import { describe, expect, it } from 'vitest';
import { computeDrawdown, expandDrawdown, expandSequence } from './weave';
import { createSampleProject } from './sample';
import { projectReducer } from '../state/project';

describe('computeDrawdown 组织矩阵计算', () => {
  it('平纹：2 综 2 踏得到棋盘格', () => {
    const d = computeDrawdown({
      threading: [0, 1],
      tieUp: [
        [true, false],
        [false, true],
      ],
      treadling: [0, 1],
    });
    expect(d).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('满足关系式 drawdown[y][x] = tieUp[threading[x]][treadling[y]]', () => {
    const p = createSampleProject();
    const d = computeDrawdown(p);
    expect(d).toHaveLength(24);
    expect(d[0]).toHaveLength(32);
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        expect(d[y][x]).toBe(p.tieUp[p.threading[x]][p.treadling[y]]);
      }
    }
  });

  it('修改穿综 → 对应经纱列沿完整关系重算，其余列不变', () => {
    const p = createSampleProject();
    const before = computeDrawdown(p);
    const edited = projectReducer(p, { type: 'set-threading', warp: 0, harness: 5 });
    const after = computeDrawdown(edited);
    for (let y = 0; y < 24; y++) {
      expect(after[y][0]).toBe(edited.tieUp[5][edited.treadling[y]]);
      for (let x = 1; x < 32; x++) {
        expect(after[y][x]).toBe(before[y][x]);
      }
    }
  });

  it('切换提综连接 → 所有相关交织点翻转，无关点不变', () => {
    const p = createSampleProject();
    const before = computeDrawdown(p);
    const edited = projectReducer(p, { type: 'toggle-tieup', harness: 2, treadle: 3 });
    const after = computeDrawdown(edited);
    let flipped = 0;
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        const related = edited.treadling[y] === 3 && edited.threading[x] === 2;
        if (related) flipped++;
        expect(after[y][x]).toBe(related ? !before[y][x] : before[y][x]);
      }
    }
    expect(flipped).toBeGreaterThan(0);
  });

  it('修改踏纹 → 对应纬纱行重算为新踏板的组织，其余行不变', () => {
    const p = createSampleProject();
    const before = computeDrawdown(p);
    const edited = projectReducer(p, { type: 'set-treadling', pick: 0, treadle: 4 });
    const after = computeDrawdown(edited);
    for (let x = 0; x < 32; x++) {
      expect(after[0][x]).toBe(edited.tieUp[edited.threading[x]][4]);
    }
    for (let y = 1; y < 24; y++) {
      expect(after[y]).toEqual(before[y]);
    }
  });
});

describe('expandDrawdown / expandSequence 循环展开', () => {
  const base = [
    [true, false],
    [false, true],
  ];

  it('按循环次数平铺，尺寸与逐格内容正确', () => {
    const d = expandDrawdown(base, 3, 2);
    expect(d).toHaveLength(4);
    expect(d[0]).toHaveLength(6);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        expect(d[y][x]).toBe(base[y % 2][x % 2]);
      }
    }
  });

  it('循环 1 次时与原图一致', () => {
    expect(expandDrawdown(base, 1, 1)).toEqual(base);
  });

  it('expandSequence 序列重复', () => {
    expect(expandSequence([1, 2], 3)).toEqual([1, 2, 1, 2, 1, 2]);
    expect(expandSequence([1, 2], 1)).toEqual([1, 2]);
  });

  it('先展开穿综/踏纹再计算 ≡ 先计算组织再展开', () => {
    const p = createSampleProject();
    const direct = expandDrawdown(computeDrawdown(p), 2, 3);
    const viaSequences = computeDrawdown({
      threading: expandSequence(p.threading, 2),
      tieUp: p.tieUp,
      treadling: expandSequence(p.treadling, 3),
    });
    expect(viaSequences).toEqual(direct);
  });
});
