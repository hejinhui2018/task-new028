import { beforeEach, describe, expect, it } from 'vitest';
import { clearProject, loadProject, saveProject, STORAGE_KEY, validateProject } from './storage';
import { createSampleProject } from './sample';

beforeEach(() => {
  localStorage.clear();
});

describe('本地存储', () => {
  it('保存后可恢复（往返一致）', () => {
    const p = createSampleProject();
    saveProject(p);
    expect(loadProject()).toEqual(p);
  });

  it('无存档时返回 null', () => {
    expect(loadProject()).toBeNull();
  });

  it('损坏的 JSON 返回 null', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadProject()).toBeNull();
  });

  it('clearProject 清除存档', () => {
    saveProject(createSampleProject());
    clearProject();
    expect(loadProject()).toBeNull();
  });
});

describe('validateProject 数据校验', () => {
  it('拒绝非对象与空对象', () => {
    expect(validateProject(null)).toBeNull();
    expect(validateProject('x')).toBeNull();
    expect(validateProject({})).toBeNull();
  });

  it('拒绝越界的穿综/踏纹与尺寸不符的提综矩阵', () => {
    const p = createSampleProject();
    expect(validateProject({ ...p, threading: [0, 99] })).toBeNull();
    expect(validateProject({ ...p, treadling: [0, -1] })).toBeNull();
    expect(validateProject({ ...p, treadling: [] })).toBeNull();
    expect(validateProject({ ...p, tieUp: [[true]] })).toBeNull();
    expect(validateProject({ ...p, tieUp: p.tieUp.map((r) => r.slice(0, 4)) })).toBeNull();
  });

  it('接受合法样稿并做深拷贝', () => {
    const p = createSampleProject();
    const v = validateProject(p);
    expect(v).toEqual(p);
    expect(v).not.toBe(p);
    expect(v!.threading).not.toBe(p.threading);
  });
});
