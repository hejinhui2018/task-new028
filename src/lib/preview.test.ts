import { describe, expect, it } from 'vitest';
import { createPreview, resetPreview, stepPreview, syncPreview, wovenRows } from './preview';
import type { PreviewState } from './preview';
import { computeDrawdown, expandDrawdown } from './weave';
import { createSampleProject } from './sample';
import { projectReducer } from '../state/project';

describe('逐纬试织预演状态机', () => {
  it('逐行前进，播放到末行后自动停止且不再前进', () => {
    let s: PreviewState = { ...createPreview(), playing: true };
    s = stepPreview(s, 2);
    expect(s).toEqual({ pick: 1, playing: true });
    s = stepPreview(s, 2);
    expect(s).toEqual({ pick: 2, playing: false });
    s = stepPreview(s, 2);
    expect(s).toEqual({ pick: 2, playing: false });
  });

  it('重置回到第 0 行', () => {
    expect(resetPreview()).toEqual({ pick: 0, playing: false });
  });

  it('总行数收缩（如循环次数调小）时钳制当前行并停止播放', () => {
    expect(syncPreview({ pick: 10, playing: true }, 6)).toEqual({ pick: 6, playing: false });
    expect(syncPreview({ pick: 3, playing: true }, 6)).toEqual({ pick: 3, playing: true });
  });

  it('wovenRows：已织行取组织图内容，未织行为 null', () => {
    const d = [[true], [false], [true]];
    expect(wovenRows(d, 1)).toEqual([[true], null, null]);
    expect(wovenRows(d, 0)).toEqual([null, null, null]);
  });

  it('编辑踏纹后从当前行继续：已织与后续行都使用最新组织', () => {
    const project = createSampleProject();
    const before = expandDrawdown(computeDrawdown(project), project.repeatX, project.repeatY);

    // 播放到第 10 行
    let state: PreviewState = { ...createPreview(), playing: true };
    for (let i = 0; i < 10; i++) state = stepPreview(state, before.length);
    expect(state.pick).toBe(10);

    // 编辑：第 3 行纬纱改踩踏板 7（0-based 6）
    const edited = projectReducer(project, { type: 'set-treadling', pick: 2, treadle: 6 });
    const after = expandDrawdown(computeDrawdown(edited), edited.repeatX, edited.repeatY);
    expect(after[2]).not.toEqual(before[2]);

    // 已织的 10 行必须反映最新组织（而不是缓存的旧行）
    const woven = wovenRows(after, state.pick);
    expect(woven[2]).toEqual(after[2]);
    expect(woven[9]).toEqual(after[9]);
    expect(woven[10]).toBeNull();

    // 从当前行继续前进一步，新织的一行同样来自最新组织
    const cont = stepPreview(state, after.length);
    expect(cont.pick).toBe(11);
    expect(wovenRows(after, cont.pick)[10]).toEqual(after[10]);
  });

  it('编辑穿综后预演立即反映新组织（列方向联动）', () => {
    const project = createSampleProject();
    const before = expandDrawdown(computeDrawdown(project), project.repeatX, project.repeatY);

    let state: PreviewState = { ...createPreview(), playing: true };
    for (let i = 0; i < 5; i++) state = stepPreview(state, before.length);

    const edited = projectReducer(project, { type: 'set-threading', warp: 0, harness: 5 });
    const after = expandDrawdown(computeDrawdown(edited), edited.repeatX, edited.repeatY);

    const woven = wovenRows(after, state.pick);
    for (let y = 0; y < state.pick; y++) {
      expect(woven[y]![0]).toBe(after[y][0]);
      expect(woven[y]![0]).toBe(edited.tieUp[5][edited.treadling[y % 24]]);
    }
  });
});
