import { describe, expect, it } from 'vitest';
import { JOURNEY } from '../contract';
import { foldEvents } from '../executor';
import { SCENARIOS } from '../scenarios';
import type { ExecutorState } from '../types';
import { initialStateFromScenario, reducer, type AppState } from '../../state/store';

/** 执行器状态的可比较投影（Map 不可直接序列化） */
function projection(s: ExecutorState) {
  return {
    stepIndex: s.stepIndex,
    status: s.status,
    steps: s.steps,
    records: s.records,
    buffered: s.buffered.map((b) => b.record.seq),
    downstream: s.downstream,
    session: s.session,
    experiment: s.experiment,
    attribution: s.attribution,
    privacyBlocks: s.privacyBlocks,
    lastTimestamp: s.lastTimestamp,
    seen: [...s.seenEventIds.entries()],
  };
}

describe('重复重放', () => {
  it('同一（契约, 事件流）折叠两次，结果完全一致（确定性）', () => {
    for (const sc of SCENARIOS) {
      const a = foldEvents(sc.contract(), JOURNEY, sc.events);
      const b = foldEvents(sc.contract(), JOURNEY, sc.events);
      expect(projection(a)).toEqual(projection(b));
    }
  });

  it('把同一事件流对已收敛的状态再重放一遍：全部被去重，旅程与下游不变', () => {
    const sc = SCENARIOS[0];
    const contract = sc.contract();
    const once = foldEvents(contract, JOURNEY, sc.events);
    const twice = foldEvents(contract, JOURNEY, [...sc.events, ...sc.events]);
    expect(once.status).toBe('completed');
    expect(twice.status).toBe('completed');
    expect(twice.downstream).toEqual(once.downstream);
    expect(twice.stepIndex).toBe(once.stepIndex);
    expect(twice.session).toEqual(once.session);
    expect(twice.experiment).toEqual(once.experiment);
    expect(twice.attribution).toEqual(once.attribution);
    // 第二遍的每条记录都是重复结论
    const secondPass = twice.records.slice(once.records.length);
    expect(secondPass).toHaveLength(sc.events.length);
    expect(secondPass.every((r) => r.verdict === 'duplicate')).toBe(true);
  });

  it('撤销/重做：redo 后的执行器状态与 undo 前完全一致', () => {
    let s: AppState = initialStateFromScenario('baseline');
    s = reducer(s, { type: 'step' });
    s = reducer(s, { type: 'step' });
    const before = foldEvents(s.contract, JOURNEY, s.applied);
    s = reducer(s, { type: 'undo' });
    expect(s.applied).toHaveLength(1);
    expect(s.future).toHaveLength(1);
    s = reducer(s, { type: 'redo' });
    const after = foldEvents(s.contract, JOURNEY, s.applied);
    expect(projection(after)).toEqual(projection(before));
  });

  it('撤销后到达新事件：重做栈被清空（标准撤销语义）', () => {
    let s: AppState = initialStateFromScenario('baseline');
    s = reducer(s, { type: 'step' });
    s = reducer(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = reducer(s, { type: 'step' });
    expect(s.future).toHaveLength(0);
    expect(s.applied).toHaveLength(1);
  });

  it('故障注入：duplicate 产生同 eventId 的克隆，privacy 注入禁采字段', () => {
    let s: AppState = initialStateFromScenario('baseline');
    const headId = s.queue[0].id;
    s = reducer(s, { type: 'inject', id: headId, fault: 'duplicate' });
    expect(s.queue).toHaveLength(4);
    expect(s.queue[1].eventId).toBe(s.queue[0].eventId);
    expect(s.queue[1].id).not.toBe(s.queue[0].id);
    s = reducer(s, { type: 'inject', id: headId, fault: 'privacy' });
    expect(s.queue[0].fields.email).toBeDefined();
    s = reducer(s, { type: 'inject', id: headId, fault: 'drop-session' });
    expect(s.queue[0].fields.sid).toBeUndefined();
    expect(s.queue[0].fields.session_id).toBeUndefined();
  });

  it('调整到达顺序会改变重放结论（乱序缓冲生效）', () => {
    let s: AppState = initialStateFromScenario('baseline');
    // 把第 3 条（发布）移到第 2 条（建项目）之前
    const thirdId = s.queue[2].id;
    s = reducer(s, { type: 'move', id: thirdId, dir: -1 });
    expect(s.queue[1].id).toBe(thirdId);
    const exec = foldEvents(s.contract, JOURNEY, s.queue);
    expect(exec.status).toBe('completed');
    // 第 2 条到达的发布事件经历过乱序缓冲
    const publishRecord = exec.records.find((r) => r.event.id === thirdId);
    expect(publishRecord?.reasons.join('\n')).toContain('乱序缓冲');
  });
});
