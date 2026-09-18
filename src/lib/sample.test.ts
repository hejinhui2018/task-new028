import { describe, expect, it } from 'vitest';
import { createSampleProject } from './sample';
import { validateProject } from './storage';
import { computeDrawdown } from './weave';

describe('内置破斜纹样稿', () => {
  it('规格：8 综、8 踏板、32 根经纱、24 行纬纱', () => {
    const p = createSampleProject();
    expect(p.harnessCount).toBe(8);
    expect(p.treadleCount).toBe(8);
    expect(p.threading).toHaveLength(32);
    expect(p.treadling).toHaveLength(24);
    expect(p.tieUp).toHaveLength(8);
    p.tieUp.forEach((row) => expect(row).toHaveLength(8));
  });

  it('穿综/踏纹取值均在有效范围内', () => {
    const p = createSampleProject();
    expect(Math.min(...p.threading)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...p.threading)).toBeLessThan(8);
    expect(Math.min(...p.treadling)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...p.treadling)).toBeLessThan(8);
  });

  it('每个踏板都连接综框、每片综框都被使用（可织）', () => {
    const p = createSampleProject();
    for (let t = 0; t < p.treadleCount; t++) {
      expect(p.tieUp.some((row) => row[t])).toBe(true);
    }
    for (let h = 0; h < p.harnessCount; h++) {
      expect(p.threading).toContain(h);
      expect(p.tieUp[h].some(Boolean)).toBe(true);
    }
  });

  it('组织图尺寸为 24 × 32，且样稿通过持久化校验', () => {
    const p = createSampleProject();
    const d = computeDrawdown(p);
    expect(d).toHaveLength(24);
    expect(d[0]).toHaveLength(32);
    expect(validateProject(p)).toEqual(p);
  });
});
