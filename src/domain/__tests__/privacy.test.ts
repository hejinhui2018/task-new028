import { describe, expect, it } from 'vitest';
import { scanPrivacy } from '../adapter';
import { defaultContract, JOURNEY } from '../contract';
import { foldEvents } from '../executor';
import type { RawEvent } from '../types';

let n = 0;
function ev(eventId: string, name: string, ts: number, fields: Record<string, unknown>): RawEvent {
  n += 1;
  return { id: `p${n}`, eventId, version: 'v2', name, timestamp: ts, fields };
}

const clean = {
  trial: { user_id: 'u-1', session_id: 's-1', experiment_variant: 'A', plan: 'pro', billing_cycle: 'monthly' },
  project: { user_id: 'u-1', session_id: 's-1', experiment_variant: 'A', project_id: 'p-1', template: 'shop' },
  publish: { user_id: 'u-1', session_id: 's-1', experiment_variant: 'A', project_id: 'p-1', url: 'https://x/p-1' },
};

describe('隐私阻断', () => {
  it('命中禁采字段（含嵌套）即被识别', () => {
    const c = defaultContract();
    expect(scanPrivacy(c, ev('x1', 'trial_started', 0, { ...clean.trial, email: 'a@b.c' }))).toEqual(['email']);
    expect(scanPrivacy(c, ev('x2', 'trial_started', 0, { ...clean.trial, device: { ip: '1.2.3.4' } }))).toEqual([
      'device.ip',
    ]);
    expect(scanPrivacy(c, ev('x3', 'trial_started', 0, clean.trial))).toEqual([]);
  });

  it('阻断事件：不适配、不进下游、不动旅程状态', () => {
    const dirty = ev('e1', 'trial_started', 0, { ...clean.trial, email: 'dev@corp.example' });
    const s = foldEvents(defaultContract(), JOURNEY, [dirty]);
    expect(s.records[0].verdict).toBe('blocked');
    expect(s.records[0].adapted).toBeNull();
    expect(s.privacyBlocks).toBe(1);
    expect(s.downstream).toHaveLength(0);
    expect(s.stepIndex).toBe(0);
    expect(s.steps[0].status).toBe('pending');
  });

  it('阻断后重发的干净事件可恢复旅程；下游全程不含隐私事件', () => {
    const dirty = ev('e1', 'trial_started', 0, { ...clean.trial, email: 'dev@corp.example' });
    const s = foldEvents(defaultContract(), JOURNEY, [
      dirty,
      ev('e2', 'trial_started', 1000, clean.trial),
      ev('e3', 'project_created', 6000, clean.project),
      ev('e4', 'first_publish', 12000, clean.publish),
    ]);
    expect(s.status).toBe('completed');
    expect(s.records.map((r) => r.verdict)).toEqual(['blocked', 'accepted', 'accepted', 'accepted']);
    expect(s.downstream).toHaveLength(3);
    // 下游事件流中不存在任何携带禁采字段的事件
    for (const a of s.downstream) {
      expect(JSON.stringify(a.fields)).not.toContain('email');
      expect(JSON.stringify(a.fields)).not.toContain('dev@corp');
    }
  });

  it('v1 旧事件同样过隐私闸口', () => {
    const dirtyV1: RawEvent = {
      id: 'p9',
      eventId: 'e9',
      version: 'v1',
      name: 'trial_activate',
      timestamp: 0,
      fields: { uid: 'u-1', sid: 's-1', exp: 'A', plan_name: 'pro/monthly', phone: '13800000000' },
    };
    const s = foldEvents(defaultContract(), JOURNEY, [dirtyV1]);
    expect(s.records[0].verdict).toBe('blocked');
    expect(s.downstream).toHaveLength(0);
  });
});
