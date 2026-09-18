import { describe, expect, it } from 'vitest';
import {
  BASE_TS,
  DEFAULT_BUNDLE,
  v1Heartbeat,
  v1Publish,
  v1Realname,
  v1Trial,
  v2Exposure,
  v2ProjectCreated,
  v2TrialStrictViolation,
  v3Unknown,
} from '../data/cases';
import { runReplay, JourneyExecutor } from './executor';
import type { RawEvent } from './types';

const bundle = DEFAULT_BUNDLE;

function ids<T extends { id: string }>(xs: T[]): string[] {
  return xs.map((x) => x.id);
}

describe('版本边界', () => {
  it('未知协议版本直接拒收，不进入下游', () => {
    const { steps, snapshot } = runReplay(bundle, [v3Unknown()]);
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('invalid');
    expect(steps[0].reasons.map((r) => r.code)).toContain('UNKNOWN_VERSION');
    expect(snapshot.downstreamIds).toEqual([]);
  });

  it('v1 事件没有迁移映射时拒收', () => {
    const { steps } = runReplay(bundle, [v1Heartbeat()]);
    expect(steps[0].status).toBe('invalid');
    expect(steps[0].reasons.map((r) => r.code)).toContain('UNKNOWN_EVENT');
  });

  it('v2 严格模式下契约外字段阻断', () => {
    const { steps } = runReplay(bundle, [v2TrialStrictViolation()]);
    expect(steps[0].status).toBe('blocked');
    expect(steps[0].reasons.map((r) => r.code)).toContain('STRICT_UNKNOWN_FIELD');
  });

  it('v1 宽松模式下契约外字段只告警不阻断', () => {
    const ev = v1Trial({ props: { plan: 'pro', referrer: 'wechat-ad/c1', exp_group: 'B', coupon: 'X', legacy_tag: 9 } });
    const { steps } = runReplay(bundle, [ev]);
    expect(steps[0].status).toBe('accepted');
    expect(steps[0].reasons.map((r) => r.code)).toContain('LENIENT_UNKNOWN_FIELD');
  });
});

describe('重复与乱序', () => {
  it('同一事件 ID 重复上报被幂等丢弃，转化只计一次', () => {
    const events = [v1Trial(), v2Exposure(), v2ProjectCreated(), v1Publish()];
    const dup = { ...v1Publish(), id: v1Publish().id, arrivalDelayMs: 500 };
    const { steps, snapshot } = runReplay(bundle, [...events, dup]);
    const dupSteps = steps.filter((s) => s.eventId === v1Publish().id);
    expect(dupSteps).toHaveLength(2);
    expect(dupSteps[0].status).toBe('accepted');
    expect(dupSteps[1].status).toBe('invalid');
    expect(dupSteps[1].reasons.map((r) => r.code)).toContain('DUPLICATE');
    // 下游只有一份发布
    expect(snapshot.downstreamIds.filter((id) => id === 'e-publish')).toHaveLength(1);
    expect(snapshot.linkage.conversion.status).toBe('attributed');
  });

  it('发布早于创建到达时先等待，创建到达后按正确顺序释放', () => {
    const events = [
      v1Trial({ arrivalDelayMs: 200 }),
      v2Exposure({ arrivalDelayMs: 200 }),
      v1Publish({ arrivalDelayMs: 300 }),
      v2ProjectCreated({ arrivalDelayMs: 300 }),
    ];
    const { steps, snapshot } = runReplay(bundle, events);
    const waiting = steps.find((s) => s.status === 'waiting');
    expect(waiting?.eventId).toBe('e-publish');
    const flushed = steps.find((s) => s.flushed);
    expect(flushed?.eventId).toBe('e-publish');
    expect(flushed?.status).toBe('accepted');
    // 下游顺序：创建在发布之前
    const downstreamOrder = snapshot.downstreamIds;
    expect(downstreamOrder.indexOf('e-project')).toBeLessThan(downstreamOrder.indexOf('e-publish'));
    expect(snapshot.stages.project.reached).toBe(true);
    expect(snapshot.stages.publish.reached).toBe(true);
  });

  it('缓冲超过等待窗口仍未补齐则事件失效、旅程断裂', () => {
    const events = [
      v1Trial({ arrivalDelayMs: 200 }),
      v2Exposure({ arrivalDelayMs: 200 }),
      v1Publish({ arrivalDelayMs: 200 }),
      v2ProjectCreated({ arrivalDelayMs: 6000 }),
    ];
    const { steps, snapshot } = runReplay(bundle, events);
    const expired = steps.find((s) => s.reasons.some((r) => r.code === 'LATE_TTL_EXPIRED'));
    expect(expired?.eventId).toBe('e-publish');
    expect(expired?.status).toBe('invalid');
    expect(snapshot.stages.publish.reached).toBe(false);
    expect(snapshot.linkage.conversion.status).toBe('idle');
  });

  it('完全倒序且在窗口外才补齐：前两个阶段事件超时失效，旅程无法成链', () => {
    const events = [
      v1Publish({ arrivalDelayMs: 200 }),
      v2ProjectCreated({ arrivalDelayMs: 200 }),
      v1Trial({ arrivalDelayMs: 3000 }),
      v2Exposure({ arrivalDelayMs: 200 }),
    ];
    const { steps, snapshot } = runReplay(bundle, events);
    // 试用在 3000ms 窗口外才到，发布/创建已超时失效；试用本身成立但旅程断裂
    expect(snapshot.stages.trial.reached).toBe(true);
    expect(snapshot.stages.project.reached).toBe(false);
    expect(snapshot.stages.publish.reached).toBe(false);
    const expiredIds = steps
      .filter((s) => s.reasons.some((r) => r.code === 'LATE_TTL_EXPIRED'))
      .map((s) => s.eventId);
    expect(expiredIds).toEqual(expect.arrayContaining(['e-publish', 'e-project']));
  });
});

describe('旅程关联（会话 / 实验 / 归因）', () => {
  it('正常混合上报：改名+拆分保留归因，v2 曝光补全实验，发布完成归因转化', () => {
    const events = [v1Trial(), v2Exposure(), v2ProjectCreated(), v1Publish()];
    const { steps, snapshot } = runReplay(bundle, events);
    expect(steps.every((s) => s.status === 'accepted')).toBe(true);
    expect(snapshot.linkage.session.status).toBe('linked');
    expect(snapshot.linkage.experiment.status).toBe('complete');
    if (snapshot.linkage.experiment.status === 'complete') {
      expect(snapshot.linkage.experiment.variant).toBe('B');
      expect(snapshot.linkage.experiment.experimentId).toBe('exp_onboarding_01');
    }
    expect(snapshot.linkage.attribution.status).toBe('attributed');
    if (snapshot.linkage.attribution.status === 'attributed') {
      expect(snapshot.linkage.attribution.utmSource).toBe('wechat-ad');
      expect(snapshot.linkage.attribution.utmCampaign).toBe('spring-2026');
    }
    expect(snapshot.linkage.conversion.status).toBe('attributed');
  });

  it('旧事件缺少 referrer：适配不伪造 utm_source，转化无法回溯渠道', () => {
    const events = [
      v1Trial({ props: { plan: 'pro' } }),
      v2Exposure(),
      v2ProjectCreated(),
      v1Publish(),
    ];
    const { steps, snapshot } = runReplay(bundle, events);
    // trial 因 v2 必填 utm_source 缺失而阻断（gap 不伪造）
    const trial = steps.find((s) => s.eventId === 'e-trial');
    expect(trial?.status).toBe('blocked');
    const codes = trial!.reasons.map((r) => r.code);
    expect(codes).toContain('MIGRATION_GAP');
    expect(codes).toContain('MISSING_FIELD');
    // 旅程卡在第一阶段
    expect(snapshot.stages.trial.reached).toBe(false);
    expect(snapshot.linkage.attribution.status).toBe('idle');
    // 流结束封口：创建/发布永久等不到试用，失效且不下发
    const sealed = steps.filter((s) => s.reasons.some((r) => r.code === 'BUFFER_FLUSHED'));
    expect(sealed.map((s) => s.eventId).sort()).toEqual(['e-project', 'e-publish']);
    expect(sealed.every((s) => s.status === 'invalid')).toBe(true);
    expect(snapshot.downstreamIds).not.toContain('e-project');
    expect(snapshot.downstreamIds).not.toContain('e-publish');
  });

  it('只有旧版 variant 没有 experiment_id：实验分组降级为 variant-only', () => {
    const events: RawEvent[] = [
      v1Trial(),
      v2ProjectCreated(),
      v1Publish(),
    ];
    const { snapshot } = runReplay(bundle, events);
    expect(snapshot.linkage.experiment.status).toBe('variant-only');
  });

  it('跨会话事件导致会话关联 mismatch', () => {
    const events: RawEvent[] = [
      v1Trial(),
      v2ProjectCreated(),
      v1Publish(),
      {
        id: 'e-publish-xs',
        schemaVersion: '1',
        name: 'project_published',
        ts: BASE_TS + 3200,
        arrivalDelayMs: 400,
        source: 'v1-sdk',
        distinctId: 'u_1001',
        sessionId: 's-strange-9999',
        props: { project_name: 'demo', template_from: 'tpl-7' },
      },
    ];
    const { snapshot } = runReplay(bundle, events);
    expect(snapshot.linkage.session.status).toBe('mismatch');
  });
});

describe('隐私阻断', () => {
  it('禁采事件整条拦截：归一化负载、下游、缓冲中都不存在', () => {
    const { steps, snapshot } = runReplay(bundle, [v1Realname(), v1Trial(), v2ProjectCreated(), v1Publish()]);
    const blocked = steps.find((s) => s.eventId === 'e-realname');
    expect(blocked?.status).toBe('blocked');
    expect(blocked?.reasons.map((r) => r.code)).toContain('PRIVACY_EVENT_BLOCKED');
    expect(blocked?.normalized).toBeUndefined();
    expect(snapshot.downstreamIds).not.toContain('e-realname');
    expect(snapshot.waiting).not.toContain('e-realname');
  });

  it('禁采字段在入口剥离，任何下游事件都不含 PII', () => {
    const events = [
      v1Trial({ props: { plan: 'pro', referrer: 'wechat-ad/c1', exp_group: 'B', phone: '13800001111', email: 'a@b.c' } }),
      v2ProjectCreated(),
      v1Publish(),
    ];
    const { steps, snapshot } = runReplay(bundle, events);
    const trial = steps.find((s) => s.eventId === 'e-trial')!;
    expect(trial.status).toBe('accepted');
    expect(trial.reasons.map((r) => r.code)).toContain('PII_FIELD_STRIPPED');
    expect(trial.normalized!.props).not.toHaveProperty('phone');
    expect(trial.normalized!.props).not.toHaveProperty('email');
    for (const id of snapshot.downstreamIds) {
      const step = steps.find((s) => s.normalized?.id === id)!;
      const props = JSON.stringify(step.normalized!.props);
      expect(props).not.toMatch(/13800001111|a@b\.c/);
    }
  });

  it('隐私事件在乱序场景下也不会被缓冲后悄悄释放', () => {
    const events = [v1Publish(), v1Realname(), v1Trial({ arrivalDelayMs: 200 }), v2ProjectCreated({ arrivalDelayMs: 200 })];
    const { snapshot, steps } = runReplay(bundle, events);
    expect(snapshot.downstreamIds).not.toContain('e-realname');
    const blocked = steps.find((s) => s.eventId === 'e-realname');
    expect(blocked?.status).toBe('blocked');
  });
});

describe('重复重放（幂等与确定性）', () => {
  it('同一输入多次重放，结果逐字节一致', () => {
    const events = [v1Trial(), v2Exposure(), v2ProjectCreated(), v1Publish()];
    const first = runReplay(bundle, events);
    const second = runReplay(bundle, events);
    expect(JSON.stringify(second.steps)).toBe(JSON.stringify(first.steps));
    expect(JSON.stringify(second.snapshot)).toBe(JSON.stringify(first.snapshot));
  });

  it('执行器实例复跑同一批事件不会把结果叠加两次', () => {
    const events = [v1Trial(), v2ProjectCreated(), v1Publish()];
    const a = runReplay(bundle, events);
    const executor = new JourneyExecutor(bundle);
    const again: ReturnType<JourneyExecutor['ingest']>[] = [];
    for (const ev of events) again.push(executor.ingest(ev));
    const flat = again.flat();
    expect(flat.map((s) => s.eventId)).toEqual(a.steps.map((s) => s.eventId));
  });

  it('重复 + 乱序同时存在时，释放后的缓冲事件再重放仍只计一次', () => {
    const events = [
      v1Trial({ arrivalDelayMs: 200 }),
      v1Trial({ arrivalDelayMs: 200, id: 'e-trial' }), // 同 ID 重试
      v1Publish({ arrivalDelayMs: 300 }),
      v2ProjectCreated({ arrivalDelayMs: 300 }),
    ];
    const { snapshot } = runReplay(bundle, events);
    expect(snapshot.downstreamIds.filter((id) => id === 'e-trial')).toHaveLength(1);
    expect(snapshot.downstreamIds.filter((id) => id === 'e-publish')).toHaveLength(1);
  });
});
