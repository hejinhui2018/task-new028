import { describe, expect, it } from 'vitest';
import { defaultContract, JOURNEY } from '../contract';
import { createExecutorState, applyEvent, foldEvents } from '../executor';
import type { RawEvent } from '../types';

let n = 0;
function ev(
  eventId: string,
  version: 'v1' | 'v2',
  name: string,
  ts: number,
  fields: Record<string, unknown>,
): RawEvent {
  n += 1;
  return { id: `t${n}`, eventId, version, name, timestamp: ts, fields };
}

const trial = (id: string, ts = 0) =>
  ev(id, 'v2', 'trial_started', ts, {
    user_id: 'u-1', session_id: 's-1', experiment_variant: 'A', plan: 'team', billing_cycle: 'annual',
  });
const project = (id: string, ts = 4000) =>
  ev(id, 'v2', 'project_created', ts, {
    user_id: 'u-1', session_id: 's-1', experiment_variant: 'A', project_id: 'p-1', template: 'blank',
  });
const publish = (id: string, ts = 9000) =>
  ev(id, 'v2', 'first_publish', ts, {
    user_id: 'u-1', session_id: 's-1', experiment_variant: 'A', project_id: 'p-1', url: 'https://x/p-1',
  });

describe('旅程执行器：顺序与重复乱序', () => {
  it('有序到达：三步依次接受，旅程完成，归因完整', () => {
    const s = foldEvents(defaultContract(), JOURNEY, [trial('e1'), project('e2'), publish('e3')]);
    expect(s.status).toBe('completed');
    expect(s.records.map((r) => r.verdict)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(s.steps.every((st) => st.status === 'accepted')).toBe(true);
    expect(s.downstream.map((a) => a.name)).toEqual(['trial_started', 'project_created', 'first_publish']);
    expect(s.attribution.status).toBe('intact');
  });

  it('乱序到达：后续步骤缓冲等待，前序到达后按到达顺序补放', () => {
    const s = foldEvents(defaultContract(), JOURNEY, [project('e2'), publish('e3'), trial('e1')]);
    expect(s.status).toBe('completed');
    // 处理时的即时结论：等待、等待、接受
    expect(s.records.map((r) => r.verdict)).toEqual(['accepted', 'accepted', 'accepted']);
    const reasons = s.records.flatMap((r) => r.reasons).join('\n');
    expect(reasons).toContain('乱序缓冲');
    expect(reasons).toContain('补放');
    // 下游顺序按旅程步骤，而非到达顺序
    expect(s.downstream.map((a) => a.name)).toEqual(['trial_started', 'project_created', 'first_publish']);
  });

  it('同一 eventId 重复投递：第二次幂等去重，下游不重复', () => {
    const s = foldEvents(defaultContract(), JOURNEY, [trial('e1'), trial('e1'), project('e2'), publish('e3')]);
    expect(s.records[1].verdict).toBe('duplicate');
    expect(s.records[1].reasons.join()).toContain('幂等去重');
    expect(s.downstream).toHaveLength(3);
    expect(s.status).toBe('completed');
  });

  it('不同 eventId 的语义重复：步骤已完成后同名事件被忽略', () => {
    const s = foldEvents(defaultContract(), JOURNEY, [trial('e1'), trial('e1b'), project('e2'), publish('e3')]);
    expect(s.records[1].verdict).toBe('duplicate');
    expect(s.records[1].reasons.join()).toContain('语义重复');
    expect(s.downstream).toHaveLength(3);
  });

  it('缓冲中的事件在等待期间不进入下游', () => {
    const state = createExecutorState(JOURNEY);
    applyEvent(defaultContract(), JOURNEY, state, project('e2'));
    expect(state.records[0].verdict).toBe('waiting');
    expect(state.downstream).toHaveLength(0);
    expect(state.stepIndex).toBe(0);
  });
});

describe('旅程执行器：失效与旅程关联', () => {
  it('当前步骤事件失效 → 步骤失效、旅程断裂，后续事件进入缓冲', () => {
    const badTrial = ev('e1', 'v1', 'trial_activate', 0, { uid: 'u-1', sid: 's-1', exp: 'A', plan_name: 'team' });
    const s = foldEvents(defaultContract(), JOURNEY, [badTrial, project('e2'), publish('e3')]);
    expect(s.status).toBe('failed');
    expect(s.steps[0].status).toBe('invalidated');
    expect(s.records[0].verdict).toBe('invalid');
    expect(s.records[1].verdict).toBe('waiting');
    expect(s.records[2].verdict).toBe('waiting');
    expect(s.downstream).toHaveLength(0);
  });

  it('关闭兼容必填规则后重放：同一事件流从断裂变为完成（字段仍缺失）', () => {
    const c = defaultContract();
    for (const r of c.rules) if (r.id === 'c1') r.enabled = false;
    const badTrial = ev('e1', 'v1', 'trial_activate', 0, { uid: 'u-1', sid: 's-1', exp: 'A', plan_name: 'team' });
    const s = foldEvents(c, JOURNEY, [badTrial, project('e2'), publish('e3')]);
    expect(s.status).toBe('completed');
    expect(s.records[0].verdict).toBe('accepted');
    expect(s.records[0].adapted?.missing).toContain('billing_cycle');
  });

  it('跨用户事件：事件被接受但归因断裂、会话切换、实验串组', () => {
    const alien = ev('e3', 'v2', 'first_publish', 9000, {
      user_id: 'u-2', session_id: 's-2', experiment_variant: 'B', project_id: 'p-1', url: 'https://x/p-1',
    });
    const s = foldEvents(defaultContract(), JOURNEY, [trial('e1'), project('e2'), alien]);
    expect(s.status).toBe('completed');
    expect(s.records[2].verdict).toBe('accepted');
    expect(s.attribution.status).toBe('broken');
    expect(s.session.switches).toBe(1);
    expect(s.experiment.conflicts).toBe(1);
    const impacts = s.records[2].impacts.map((i) => i.text).join('\n');
    expect(impacts).toContain('用户标识变更');
  });

  it('缺少会话字段：接受但会话关联中断、归因降级', () => {
    const noSid = ev('e2', 'v2', 'project_created', 4000, {
      user_id: 'u-1', experiment_variant: 'A', project_id: 'p-1', template: 'blank',
    });
    const s = foldEvents(defaultContract(), JOURNEY, [trial('e1'), noSid, publish('e3')]);
    expect(s.status).toBe('completed');
    expect(s.session.unknownEvents).toBe(1);
    expect(s.attribution.status).toBe('degraded');
  });

  it('旅程之外的事件：未登记事件判失效；已登记但不在旅程中的事件同样判失效，均不进入下游', () => {
    // 未登记在 v2 协议中的事件
    const unknown = ev('e9', 'v2', 'legacy_thing', 500, { user_id: 'u-1' });
    const s1 = foldEvents(defaultContract(), JOURNEY, [trial('e1'), unknown, project('e2'), publish('e3')]);
    expect(s1.records[1].verdict).toBe('invalid');
    expect(s1.records[1].reasons.join()).toContain('未登记在 v2 协议中');
    expect(s1.downstream).toHaveLength(3);

    // 已登记但不在旅程定义中的事件
    const c = defaultContract();
    c.v2Events.push({ name: 'profile_completed', requiredFields: [] });
    const stranger = ev('e8', 'v2', 'profile_completed', 500, { user_id: 'u-1' });
    const s2 = foldEvents(c, JOURNEY, [trial('e1'), stranger, project('e2'), publish('e3')]);
    expect(s2.records[1].verdict).toBe('invalid');
    expect(s2.records[1].reasons.join()).toContain('不在旅程定义中');
    expect(s2.downstream).toHaveLength(3);
    expect(s2.status).toBe('completed');
  });
});
