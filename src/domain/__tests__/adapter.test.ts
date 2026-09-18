import { describe, expect, it } from 'vitest';
import { adaptEvent } from '../adapter';
import { defaultContract } from '../contract';
import type { RawEvent } from '../types';

function raw(partial: Partial<RawEvent> & Pick<RawEvent, 'version' | 'name' | 'fields'>): RawEvent {
  return { id: 't1', eventId: 'evt-t1', timestamp: 1000, ...partial };
}

describe('契约适配：版本边界', () => {
  it('v1 事件经映射/改名/拆分后等价于 v2', () => {
    const a = adaptEvent(
      defaultContract(),
      raw({
        version: 'v1',
        name: 'trial_activate',
        fields: { uid: 'u-1', sid: 's-1', exp: 'A', plan_name: 'team/annual' },
      }),
    );
    expect(a.name).toBe('trial_started');
    expect(a.fields.user_id).toBe('u-1');
    expect(a.fields.session_id).toBe('s-1');
    expect(a.fields.experiment_variant).toBe('A');
    expect(a.fields.plan).toBe('team');
    expect(a.fields.billing_cycle).toBe('annual');
    expect(a.fatal).toEqual([]);
    expect(a.missing).toEqual([]);
  });

  it('拆分缺少分隔符时：派生不出的字段留空并记 missing，绝不伪造', () => {
    const a = adaptEvent(
      defaultContract(),
      raw({ version: 'v1', name: 'trial_activate', fields: { uid: 'u-1', sid: 's-1', exp: 'A', plan_name: 'team' } }),
    );
    expect(a.fields.plan).toBe('team');
    expect('billing_cycle' in a.fields).toBe(false); // 没有编造值
    expect(a.missing).toContain('billing_cycle');
    expect(a.fatal.join()).toContain('billing_cycle'); // 兼容必填 → 失效
  });

  it('拆分源字段缺失时：两个目标字段都记 missing，不伪造', () => {
    const a = adaptEvent(
      defaultContract(),
      raw({ version: 'v1', name: 'trial_activate', fields: { uid: 'u-1', sid: 's-1', exp: 'A' } }),
    );
    expect(a.missing).toContain('plan');
    expect(a.missing).toContain('billing_cycle');
    expect(a.fields.plan).toBeUndefined();
    expect(a.fields.billing_cycle).toBeUndefined();
    expect(a.fatal.length).toBeGreaterThan(0);
  });

  it('无事件映射规则的 v1 事件：按原名保留并判未登记', () => {
    const a = adaptEvent(
      defaultContract(),
      raw({ version: 'v1', name: 'legacy_thing', fields: { uid: 'u-1' } }),
    );
    expect(a.name).toBe('legacy_thing');
    expect(a.fatal.join()).toContain('未登记在 v2 协议中');
  });

  it('v2 事件缺必填字段 → fatal；未映射的多余字段原样保留', () => {
    const a = adaptEvent(
      defaultContract(),
      raw({ version: 'v2', name: 'project_created', fields: { user_id: 'u-1', extra_flag: true } }),
    );
    expect(a.fatal.join()).toContain('project_id');
    expect(a.fatal.join()).toContain('template');
    expect(a.fields.extra_flag).toBe(true);
  });

  it('改名规则被关闭时：exp 不迁移，experiment_variant 记为软缺失（不阻断）', () => {
    const c = defaultContract();
    for (const r of c.rules) if (r.id === 'r3') r.enabled = false;
    const a = adaptEvent(
      c,
      raw({ version: 'v1', name: 'trial_activate', fields: { uid: 'u-1', sid: 's-1', exp: 'B', plan_name: 'pro/monthly' } }),
    );
    expect(a.fields.exp).toBe('B'); // 原样保留
    expect(a.fields.experiment_variant).toBeUndefined();
    expect(a.missing).toContain('experiment_variant');
    expect(a.fatal).toEqual([]); // 软缺失不致命
  });

  it('兼容必填规则关闭后：同一事件从失效变为可接受（缺失仍被记录）', () => {
    const c = defaultContract();
    for (const r of c.rules) if (r.id === 'c1') r.enabled = false;
    const a = adaptEvent(
      c,
      raw({ version: 'v1', name: 'trial_activate', fields: { uid: 'u-1', sid: 's-1', exp: 'A', plan_name: 'team' } }),
    );
    expect(a.fatal).toEqual([]);
    expect(a.missing).toContain('billing_cycle');
    expect('billing_cycle' in a.fields).toBe(false);
  });
});
