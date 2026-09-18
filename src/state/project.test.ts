import { describe, expect, it } from 'vitest';
import { projectReducer } from './project';
import { createSampleProject } from '../lib/sample';

describe('projectReducer 编辑动作', () => {
  it('set-threading 只改目标经纱；重复设置同一综框不产生新状态', () => {
    const p = createSampleProject();
    const next = projectReducer(p, { type: 'set-threading', warp: 0, harness: 5 });
    expect(next.threading[0]).toBe(5);
    expect(next.threading.slice(1)).toEqual(p.threading.slice(1));
    expect(projectReducer(next, { type: 'set-threading', warp: 0, harness: 5 })).toBe(next);
  });

  it('toggle-tieup 翻转目标格，其余格不变', () => {
    const p = createSampleProject();
    const next = projectReducer(p, { type: 'toggle-tieup', harness: 2, treadle: 3 });
    expect(next.tieUp[2][3]).toBe(!p.tieUp[2][3]);
    for (let h = 0; h < 8; h++) {
      for (let t = 0; t < 8; t++) {
        if (h !== 2 || t !== 3) expect(next.tieUp[h][t]).toBe(p.tieUp[h][t]);
      }
    }
  });

  it('set-treadling 只改目标纬纱行', () => {
    const p = createSampleProject();
    const next = projectReducer(p, { type: 'set-treadling', pick: 4, treadle: 7 });
    expect(next.treadling[4]).toBe(7);
    expect(next.treadling.filter((_, i) => i !== 4)).toEqual(p.treadling.filter((_, i) => i !== 4));
  });

  it('参数钳制在合法区间', () => {
    const p = createSampleProject();
    expect(projectReducer(p, { type: 'set-repeat-x', value: 99 }).repeatX).toBe(4);
    expect(projectReducer(p, { type: 'set-repeat-x', value: 0 }).repeatX).toBe(1);
    expect(projectReducer(p, { type: 'set-max-float', value: 0 }).maxFloat).toBe(1);
    expect(projectReducer(p, { type: 'set-max-float', value: 100 }).maxFloat).toBe(24);
  });

  it('restore 整体替换样稿', () => {
    const p = createSampleProject();
    const edited = projectReducer(p, { type: 'set-threading', warp: 0, harness: 5 });
    const restored = projectReducer(edited, { type: 'restore', project: createSampleProject() });
    expect(restored).toEqual(p);
  });

  it('越界索引安全忽略', () => {
    const p = createSampleProject();
    expect(projectReducer(p, { type: 'set-threading', warp: 999, harness: 0 })).toBe(p);
    expect(projectReducer(p, { type: 'set-treadling', pick: -1, treadle: 0 })).toBe(p);
    expect(projectReducer(p, { type: 'toggle-tieup', harness: 99, treadle: 0 })).toBe(p);
  });
});
