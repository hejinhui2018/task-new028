import { defaultContract } from './contract';
import type { EventContract, ProtocolVersion, RawEvent } from './types';

/** 场景事件时间戳基准：2026-06-01 09:00:00 UTC */
export const BASE_TS = 1_780_304_400_000;

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  learnings: string[];
  /** 场景预设契约（工厂函数，每次加载返回全新副本） */
  contract: () => EventContract;
  events: RawEvent[];
}

let seq = 0;
function ev(
  eventId: string,
  version: ProtocolVersion,
  name: string,
  offsetMs: number,
  fields: Record<string, unknown>,
): RawEvent {
  seq += 1;
  return { id: `e${seq}`, eventId, version, name, timestamp: BASE_TS + offsetMs, fields };
}

/** 场景一：基线 —— 新旧 SDK 混合、有序到达 */
const s1Events: RawEvent[] = [
  ev('evt-1001', 'v1', 'trial_activate', 0, { uid: 'u-1001', sid: 's-01', exp: 'A', plan_name: 'team/annual' }),
  ev('evt-1002', 'v2', 'project_created', 4000, {
    user_id: 'u-1001', session_id: 's-01', experiment_variant: 'A', project_id: 'p-77', template: 'blank',
  }),
  ev('evt-1003', 'v1', 'publish', 9000, { uid: 'u-1001', sid: 's-01', exp: 'A', pid: 'p-77', url: 'https://demo.app/p-77' }),
];

/** 场景二：字段改名缺失 —— exp 未映射导致实验分组丢失（预设契约中 r3 规则被关闭） */
const s2Events: RawEvent[] = [
  ev('evt-2001', 'v1', 'trial_activate', 0, { uid: 'u-1002', sid: 's-02', exp: 'B', plan_name: 'pro/monthly' }),
  ev('evt-2002', 'v1', 'proj_create', 5000, { uid: 'u-1002', sid: 's-02', exp: 'B', pid: 'p-81', tpl: 'blog' }),
  ev('evt-2003', 'v1', 'publish', 11000, { uid: 'u-1002', sid: 's-02', exp: 'B', pid: 'p-81', url: 'https://demo.app/p-81' }),
];

/** 场景三：重复与乱序 —— 开通事件晚到，发布事件重复投递 */
const s3Events: RawEvent[] = [
  ev('evt-3002', 'v2', 'project_created', 4000, {
    user_id: 'u-1003', session_id: 's-03', experiment_variant: 'A', project_id: 'p-90', template: 'docs',
  }),
  ev('evt-3003', 'v2', 'first_publish', 9000, {
    user_id: 'u-1003', session_id: 's-03', experiment_variant: 'A', project_id: 'p-90', url: 'https://demo.app/p-90',
  }),
  ev('evt-3003', 'v2', 'first_publish', 9000, {
    user_id: 'u-1003', session_id: 's-03', experiment_variant: 'A', project_id: 'p-90', url: 'https://demo.app/p-90',
  }),
  ev('evt-3001', 'v2', 'trial_started', 0, {
    user_id: 'u-1003', session_id: 's-03', experiment_variant: 'A', plan: 'team', billing_cycle: 'annual',
  }),
];

/** 场景四：隐私阻断 —— 首条开通事件夹带 email，SDK 修复后重发 */
const s4Events: RawEvent[] = [
  ev('evt-4001', 'v2', 'trial_started', 0, {
    user_id: 'u-1004', session_id: 's-04', experiment_variant: 'B',
    plan: 'pro', billing_cycle: 'monthly', email: 'dev@corp.example',
  }),
  ev('evt-4002', 'v2', 'trial_started', 1000, {
    user_id: 'u-1004', session_id: 's-04', experiment_variant: 'B', plan: 'pro', billing_cycle: 'monthly',
  }),
  ev('evt-4003', 'v2', 'project_created', 6000, {
    user_id: 'u-1004', session_id: 's-04', experiment_variant: 'B', project_id: 'p-95', template: 'shop',
  }),
  ev('evt-4004', 'v1', 'publish', 12000, { uid: 'u-1004', sid: 's-04', exp: 'B', pid: 'p-95', url: 'https://demo.app/p-95' }),
];

/** 场景五：版本边界 —— plan_name 拆不出付费周期，契约禁止伪造 */
const s5Events: RawEvent[] = [
  ev('evt-5001', 'v1', 'trial_activate', 0, { uid: 'u-1005', sid: 's-05', exp: 'A', plan_name: 'team' }),
  ev('evt-5002', 'v2', 'trial_started', 2000, {
    user_id: 'u-1005', session_id: 's-05', experiment_variant: 'A', plan: 'team', billing_cycle: 'annual',
  }),
  ev('evt-5003', 'v1', 'proj_create', 6000, { uid: 'u-1005', sid: 's-05', exp: 'A', pid: 'p-99', tpl: 'blank' }),
  ev('evt-5004', 'v1', 'publish', 11000, { uid: 'u-1005', sid: 's-05', exp: 'A', pid: 'p-99', url: 'https://demo.app/p-99' }),
];

/** 场景六：旅程关联 —— 发布事件用户标识变更，归因断裂 */
const s6Events: RawEvent[] = [
  ev('evt-6001', 'v2', 'trial_started', 0, {
    user_id: 'u-1006', session_id: 's-06', experiment_variant: 'A', plan: 'pro', billing_cycle: 'annual',
  }),
  ev('evt-6002', 'v2', 'project_created', 5000, {
    user_id: 'u-1006', session_id: 's-06', experiment_variant: 'A', project_id: 'p-88', template: 'blank',
  }),
  ev('evt-6003', 'v2', 'first_publish', 10000, {
    user_id: 'u-1007', session_id: 's-07', experiment_variant: 'B', project_id: 'p-88', url: 'https://demo.app/p-88',
  }),
];

function s2Contract(): EventContract {
  const c = defaultContract();
  for (const r of c.rules) {
    if (r.id === 'r3') r.enabled = false; // 故意缺失 exp → experiment_variant 的改名规则
  }
  return c;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    title: '① 基线：新旧 SDK 混合有序到达',
    summary: 'v1 开通 → v2 建项目 → v1 发布。契约规则齐全，全部事件应被接受，归因链完整。',
    learnings: ['v1 事件经事件映射 + 字段改名 + 拆分后等价于 v2', '三步旅程依次接受，会话/实验/归因台账全部绿色'],
    contract: defaultContract,
    events: s1Events,
  },
  {
    id: 'rename-gap',
    title: '② 字段改名缺失：实验分组丢失',
    summary: '预设契约故意关闭 exp → experiment_variant 改名规则。事件仍被接受，但实验分组与归因持续降级。到左侧契约面板重新启用 r3 规则，已到达事件会立即按新契约重放并恢复。',
    learnings: ['旧事件"被接收"≠"信息完整"：未映射字段原样保留但 v2 侧记为缺失', '维护契约规则会改变全部已到达事件的验收结论'],
    contract: s2Contract,
    events: s2Events,
  },
  {
    id: 'dup-reorder',
    title: '③ 重复与乱序：开通事件晚到',
    summary: '建项目、发布（含一次重复投递）先于开通到达。前两者进入乱序缓冲，重复投递被幂等去重；开通到达后缓冲事件按顺序补放，旅程恢复。',
    learnings: ['同一 eventId 重复投递只处理一次', '乱序事件缓冲等待而非丢弃，前序到达后自动补放'],
    contract: defaultContract,
    events: s3Events,
  },
  {
    id: 'privacy-block',
    title: '④ 隐私阻断：禁采字段不得入闸',
    summary: '首条开通事件夹带 email（禁采字段），在入闸处被阻断：不适配、不进下游、不动旅程。SDK 修复后重发的干净事件让旅程继续。',
    learnings: ['阻断事件永不进入下游事件流', '阻断不消耗 eventId 之外的任何状态，重发可恢复'],
    contract: defaultContract,
    events: s4Events,
  },
  {
    id: 'version-edge',
    title: '⑤ 版本边界：拆分失败，禁止伪造',
    summary: '旧包 plan_name 为 "team"，不含分隔符，拆不出 billing_cycle。兼容规则 c1 将其判为失效，旅程断裂。到契约面板关闭 c1（或改为非必填）后重放：事件被接受但字段留空——适配器绝不伪造。',
    learnings: ['拆不出的字段记入缺失并留空，绝不编造', '兼容必填规则决定"失效"还是"降级接受"'],
    contract: defaultContract,
    events: s5Events,
  },
  {
    id: 'journey-link',
    title: '⑥ 旅程关联：跨用户事件导致归因断裂',
    summary: '发布事件的用户/会话/实验变体与前两步不一致。事件本身合法被接受，但归因台账判定断裂：首次发布无法归因到开通来源。',
    learnings: ['旅程是同一用户的状态机，锚点不一致即报警', '事件合法 ≠ 可归因'],
    contract: defaultContract,
    events: s6Events,
  },
];
