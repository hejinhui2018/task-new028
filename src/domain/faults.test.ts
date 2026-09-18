import { describe, expect, it } from 'vitest';
import {
  injectCrossSession,
  injectDuplicates,
  injectLate,
  injectPiiField,
  moveItem,
  reverseArrivals,
  shuffleArrivals,
} from './faults';
import { v1Trial, v2Exposure, v2ProjectCreated, v1Publish } from '../data/cases';
import type { RawEvent } from './types';

const base: RawEvent[] = [v1Trial(), v2Exposure(), v2ProjectCreated(), v1Publish()];

describe('故障注入纯函数', () => {
  it('注入重复：副本复用原事件 ID（幂等键），原数组不被修改', () => {
    const snapshotBefore = JSON.stringify(base);
    const out = injectDuplicates(base, [0]);
    expect(out).toHaveLength(5);
    expect(out[1].id).toBe(base[0].id);
    expect(out[1].faults).toContain('duplicate');
    expect(JSON.stringify(base)).toBe(snapshotBefore);
  });

  it('注入迟到：仅修改目标事件的到达间隔', () => {
    const out = injectLate(base, [3], 9000);
    expect(out[3].arrivalDelayMs).toBe(9000);
    expect(out[3].faults).toContain('late');
    expect(out[0].arrivalDelayMs).toBe(base[0].arrivalDelayMs);
  });

  it('注入 PII 字段：目标事件携带 phone/email 并被标记', () => {
    const out = injectPiiField(base, [0]);
    expect(out[0].props.phone).toBe('13800001111');
    expect(out[0].props.email).toBe('tester@example.com');
    expect(out[0].faults).toContain('pii');
    expect(out[1].props).not.toHaveProperty('phone');
  });

  it('跨会话副本换了 sessionId 与新 ID', () => {
    const out = injectCrossSession(base, [2]);
    expect(out).toHaveLength(5);
    expect(out[3].sessionId).toBe('s-strange-9999');
    expect(out[3].id).toBe('e-project-xs');
    expect(out[3].faults).toContain('cross-session');
  });

  it('确定性洗牌：同一种子两次结果一致且元素不丢失', () => {
    const a = shuffleArrivals(base);
    const b = shuffleArrivals(base);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a.map((e) => e.id).sort()).toEqual(base.map((e) => e.id).sort());
    expect(a.every((e) => e.faults?.includes('reordered'))).toBe(true);
  });

  it('倒序与手动移动都标记乱序', () => {
    const rev = reverseArrivals(base);
    expect(rev.map((e) => e.id)).toEqual(base.map((e) => e.id).reverse());
    const moved = moveItem(base, 0, 2);
    expect(moved[2].id).toBe('e-trial');
    expect(moved[2].faults).toContain('reordered');
  });

  it('手动移动越界时返回等长副本', () => {
    const out = moveItem(base, 0, 99);
    expect(out).toHaveLength(base.length);
    expect(out.map((e) => e.id)).toEqual(base.map((e) => e.id));
  });
});
