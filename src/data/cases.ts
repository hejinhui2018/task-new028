// 内置可演示迁移案例：v1 / v2 协议契约、迁移规则、隐私契约、用户旅程
import type { ContractBundle, RawEvent } from '../domain/types';

export const BASE_TS = 1_700_000_000_000;

export const DEFAULT_BUNDLE: ContractBundle = {
  protocols: [
    {
      version: '1',
      label: 'v1（旧版 SDK，宽松模式）',
      strict: false,
      events: [
        {
          name: 'trial_started',
          description: '开通试用',
          required: ['plan'],
          optional: ['referrer', 'exp_group', 'coupon'],
          types: { plan: 'string', referrer: 'string', exp_group: 'string' },
        },
        {
          name: 'project_published',
          description: '首次发布（旧版把创建和发布合在一个事件里）',
          required: ['project_name'],
          optional: ['template_from'],
        },
        {
          name: 'realname_submitted',
          description: '实名提交（旧版含明文 PII，已列入禁采）',
          required: [],
          optional: ['id_card', 'real_name'],
        },
        {
          name: 'legacy_heartbeat',
          description: '旧版心跳，v2 已下线且无迁移映射',
          required: [],
          optional: [],
        },
      ],
    },
    {
      version: '2',
      label: 'v2（新版 SDK，严格模式）',
      strict: true,
      events: [
        {
          name: 'trial_started',
          description: '开通试用',
          required: ['plan', 'utm_source', 'variant'],
          optional: ['utm_campaign', 'experiment_id', 'coupon'],
          types: {
            plan: 'string',
            utm_source: 'string',
            utm_campaign: 'string',
            variant: 'string',
            experiment_id: 'string',
          },
        },
        {
          name: 'experiment_exposure',
          description: '实验曝光',
          required: ['experiment_id', 'variant'],
          optional: [],
          types: { experiment_id: 'string', variant: 'string' },
        },
        {
          name: 'project_created',
          description: '创建项目',
          required: ['project_name'],
          optional: ['template_id'],
          types: { project_name: 'string', template_id: 'string' },
        },
        {
          name: 'project_published',
          description: '首次发布（转化事件）',
          required: ['project_name'],
          optional: ['template_id'],
          types: { project_name: 'string', template_id: 'string' },
        },
        {
          name: 'identity_verified',
          description: '身份核验事件（禁采演示）',
          required: [],
          optional: [],
        },
      ],
    },
  ],
  migration: {
    fromVersion: '1',
    toVersion: '2',
    events: [
      {
        fromEvent: 'trial_started',
        toEvent: 'trial_started',
        fieldRules: [
          // referrer=渠道/活动 复合值，v2 拆成两个归因字段
          { kind: 'split', from: 'referrer', delimiter: '/', to: [{ field: 'utm_source', part: 0 }, { field: 'utm_campaign', part: 1 }] },
          // 实验桶改名；experiment_id 是 v2 新增，旧版没有 → gap，不伪造
          { kind: 'rename', from: 'exp_group', to: 'variant' },
          { kind: 'gap', to: 'experiment_id' },
          // 旧版若误带明文手机号，迁移时丢弃，不做伪哈希
          { kind: 'dropPii', from: 'phone' },
        ],
      },
      {
        fromEvent: 'project_published',
        toEvent: 'project_published',
        fieldRules: [
          { kind: 'rename', from: 'template_from', to: 'template_id' },
        ],
      },
      {
        fromEvent: 'realname_submitted',
        toEvent: 'identity_verified',
        fieldRules: [
          { kind: 'dropPii', from: 'id_card' },
          { kind: 'dropPii', from: 'real_name' },
        ],
      },
    ],
  },
  privacy: {
    deniedEvents: ['realname_submitted', 'identity_verified'],
    deniedFields: ['id_card', 'real_name', 'phone', 'email'],
  },
  journey: {
    name: '开通试用 → 创建项目 → 首次发布',
    stages: [
      { key: 'trial', event: 'trial_started', label: '开通试用' },
      { key: 'project', event: 'project_created', label: '创建项目' },
      { key: 'publish', event: 'project_published', label: '首次发布' },
    ],
    maxWaitMs: 3000,
    dedupeWindowMs: 10_000,
  },
};

// ── 事件工厂 ──────────────────────────────────────────────────

const USER = 'u_1001';
const SESSION = 's_abc-2026';

export function v1Trial(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-trial',
    schemaVersion: '1',
    name: 'trial_started',
    ts: BASE_TS,
    seq: 1,
    arrivalDelayMs: 200,
    source: 'v1-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: {
      plan: 'pro',
      referrer: 'wechat-ad/spring-2026',
      exp_group: 'B',
    },
    ...overrides,
  };
}

export function v2Exposure(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-exposure',
    schemaVersion: '2',
    name: 'experiment_exposure',
    ts: BASE_TS + 1000,
    seq: 2,
    arrivalDelayMs: 250,
    source: 'v2-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: { experiment_id: 'exp_onboarding_01', variant: 'B' },
    ...overrides,
  };
}

export function v2ProjectCreated(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-project',
    schemaVersion: '2',
    name: 'project_created',
    ts: BASE_TS + 2000,
    seq: 3,
    arrivalDelayMs: 300,
    source: 'v2-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: { project_name: 'demo', template_id: 'tpl-7' },
    ...overrides,
  };
}

export function v1Publish(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-publish',
    schemaVersion: '1',
    name: 'project_published',
    ts: BASE_TS + 3000,
    seq: 4,
    arrivalDelayMs: 300,
    source: 'v1-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: { project_name: 'demo', template_from: 'tpl-7' },
    ...overrides,
  };
}

export function v1Realname(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-realname',
    schemaVersion: '1',
    name: 'realname_submitted',
    ts: BASE_TS + 2500,
    seq: 5,
    arrivalDelayMs: 280,
    source: 'v1-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: { id_card: '110101199001011234', real_name: '张三' },
    faults: ['pii'],
    ...overrides,
  };
}

export function v3Unknown(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-ping-v3',
    schemaVersion: '3',
    name: 'ping',
    ts: BASE_TS + 4000,
    seq: 9,
    arrivalDelayMs: 200,
    source: 'v2-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: { uptime: 42 },
    faults: ['unknown-version'],
    ...overrides,
  };
}

export function v1Heartbeat(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-heartbeat',
    schemaVersion: '1',
    name: 'legacy_heartbeat',
    ts: BASE_TS + 500,
    seq: 6,
    arrivalDelayMs: 200,
    source: 'v1-sdk',
    distinctId: USER,
    sessionId: SESSION,
    props: {},
    ...overrides,
  };
}

export function v2TrialStrictViolation(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: 'e-trial-strict',
    schemaVersion: '2',
    name: 'trial_started',
    ts: BASE_TS,
    seq: 1,
    arrivalDelayMs: 200,
    source: 'v2-sdk',
    distinctId: USER,
    sessionId: SESSION,
    // ab_hint 不在 v2 契约内 → 严格模式阻断
    props: { plan: 'pro', utm_source: 'wechat-ad', variant: 'B', ab_hint: 'bucketing-v2' },
    faults: ['strict-unknown-field'],
    ...overrides,
  };
}

// ── 演示案例 ──────────────────────────────────────────────────

export interface DemoCase {
  id: string;
  name: string;
  description: string;
  events: RawEvent[];
}

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'happy-mixed',
    name: '正常混合上报',
    description: 'v1/v2 SDK 混合、按序到达：旧版字段改名/拆分后归因完整，实验由 v2 曝光补全，首次发布成功转化。',
    events: [v1Trial(), v2Exposure(), v2ProjectCreated(), v1Publish()],
  },
  {
    id: 'rename-gap',
    name: '字段改名后的归因缺口',
    description: '旧版试用事件没有 referrer / exp_group：适配不伪造 utm_source，即便发布到达，转化仍无法回溯渠道。',
    events: [
      v1Trial({ props: { plan: 'pro' }, id: 'e-trial-noref' }),
      v2Exposure(),
      v2ProjectCreated(),
      v1Publish(),
    ],
  },
  {
    id: 'out-of-order',
    name: '乱序但窗口内补齐',
    description: '发布先于创建到达（晚 300ms）：进入乱序缓冲等待，创建到达后级联释放，顺序修正，转化照常归因。',
    events: [
      v1Trial(),
      v2Exposure(),
      v1Publish({ arrivalDelayMs: 300, faults: ['reordered'] }),
      v2ProjectCreated({ arrivalDelayMs: 300, faults: ['reordered'] }),
    ],
  },
  {
    id: 'late-expired',
    name: '迟到超时，旅程断裂',
    description: '发布在缓冲中等待创建超过 3000ms 窗口：事件失效不下发，旅程停在创建阶段，转化不计入。',
    events: [
      v1Trial({ arrivalDelayMs: 200 }),
      v2Exposure({ arrivalDelayMs: 200 }),
      v1Publish({ arrivalDelayMs: 200, faults: ['late', 'reordered'] }),
      v2ProjectCreated({ arrivalDelayMs: 6000, faults: ['late'] }),
    ],
  },
  {
    id: 'privacy-block',
    name: '隐私阻断',
    description: '试用事件误带明文手机号（入口剥离），旧版实名事件携带身份证整条拦截：隐私数据绝不流入下游。',
    events: [
      v1Trial({
        id: 'e-trial-pii',
        props: { plan: 'pro', referrer: 'wechat-ad/spring-2026', exp_group: 'B', phone: '13800001111' },
        faults: ['pii'],
      }),
      v2Exposure(),
      v2ProjectCreated(),
      v1Realname(),
      v1Publish(),
    ],
  },
  {
    id: 'version-boundary',
    name: '版本边界拒收',
    description: 'v3 未知版本事件、无迁移映射的旧版心跳、v2 严格模式契约外字段：三类边界输入全部拒收或阻断。',
    events: [v3Unknown(), v1Heartbeat(), v2TrialStrictViolation()],
  },
  {
    id: 'duplicates',
    name: '重复上报',
    description: '试用与发布各被 SDK 重试重复发送一次（同一事件 ID）：按事件 ID 幂等去重，转化不重复计入。',
    events: [
      v1Trial(),
      duplicateRetryOf(v1Trial(), 400),
      v2Exposure(),
      v2ProjectCreated(),
      v1Publish(),
      duplicateRetryOf(v1Publish(), 500),
    ],
  },
];

// 注意：重复案例里的“重试”必须复用原事件 ID 才能验证幂等
export function duplicateRetryOf(ev: RawEvent, extraDelayMs = 500): RawEvent {
  return {
    ...structuredCloneSafe(ev),
    props: { ...ev.props },
    id: ev.id, // 幂等键不变
    arrivalDelayMs: extraDelayMs,
    faults: ['duplicate'],
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
