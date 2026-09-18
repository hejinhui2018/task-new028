// ─────────────────────────────────────────────────────────────
// EventContract 领域类型
// ─────────────────────────────────────────────────────────────

/** SDK 上报的原始事件（可能来自 v1 或 v2 SDK） */
export interface RawEvent {
  /** SDK 生成的事件 ID，用于幂等去重 */
  id: string;
  /** 协议版本，如 '1' / '2'；故障注入可能给出 '3' */
  schemaVersion: string;
  /** 事件名（按各版本自身契约命名） */
  name: string;
  /** 客户端事件时间戳（ms） */
  ts: number;
  /** SDK 单调序号（乱序判定的辅助信息） */
  seq?: number;
  /** 到达延迟（ms），故障注入用：相对正常到达时刻额外迟到 */
  arrivalDelayMs?: number;
  source: 'v1-sdk' | 'v2-sdk';
  distinctId?: string;
  sessionId?: string;
  props: Record<string, unknown>;
  /** 标注该事件被注入了什么故障（仅用于 UI 展示） */
  faults?: InjectedFault[];
}

export type InjectedFault =
  | 'duplicate'
  | 'reordered'
  | 'late'
  | 'pii'
  | 'unknown-version'
  | 'strict-unknown-field'
  | 'cross-session';

// ── 协议契约 ─────────────────────────────────────────────────

export interface EventContract {
  name: string;
  description?: string;
  required: string[];
  optional: string[];
  /** 字段类型（仅校验 required/optional 中出现的键） */
  types?: Record<string, FieldType>;
}

export type FieldType = 'string' | 'number' | 'boolean';

export interface ProtocolVersion {
  version: string;
  label: string;
  /** v2 严格模式：出现契约外字段直接阻断；v1 宽松模式仅告警 */
  strict: boolean;
  events: EventContract[];
}

// ── 迁移规则 ─────────────────────────────────────────────────

export type FieldRule =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'split'; from: string; delimiter: string; to: { field: string; part: number }[] }
  /** v1 中的 PII 原文字段：清洗丢弃，不做伪哈希 */
  | { kind: 'dropPii'; from: string }
  /** v2 必填但 v1 从未采集：显式登记为缺口，禁止伪造 */
  | { kind: 'gap'; to: string };

export interface EventMigration {
  fromEvent: string;
  toEvent: string;
  fieldRules: FieldRule[];
}

export interface MigrationContract {
  fromVersion: string;
  toVersion: string;
  events: EventMigration[];
}

// ── 隐私契约 ─────────────────────────────────────────────────

export interface PrivacyContract {
  /** 整条禁止采集的事件名（任意版本命中即阻断，不产生下游记录） */
  deniedEvents: string[];
  /** 禁止采集的字段名（命中则从事件中剥离） */
  deniedFields: string[];
}

// ── 旅程定义 ─────────────────────────────────────────────────

export type JourneyStageKey = 'trial' | 'project' | 'publish';

export interface JourneyStage {
  key: JourneyStageKey;
  /** 归一化（v2 命名）后的事件名 */
  event: string;
  label: string;
}

export interface JourneyDefinition {
  name: string;
  stages: JourneyStage[];
  /** 乱序最长等待窗口（ms），超时缓冲失效 */
  maxWaitMs: number;
  /** 去重窗口（ms） */
  dedupeWindowMs: number;
}

export interface ContractBundle {
  protocols: ProtocolVersion[];
  migration: MigrationContract;
  privacy: PrivacyContract;
  journey: JourneyDefinition;
}

// ── 执行结果 ─────────────────────────────────────────────────

export type StepStatus = 'accepted' | 'waiting' | 'blocked' | 'invalid';

export type ReasonCode =
  | 'UNKNOWN_VERSION'
  | 'UNKNOWN_EVENT'
  | 'MISSING_FIELD'
  | 'TYPE_MISMATCH'
  | 'STRICT_UNKNOWN_FIELD'
  | 'LENIENT_UNKNOWN_FIELD'
  | 'PRIVACY_EVENT_BLOCKED'
  | 'PII_FIELD_STRIPPED'
  | 'DUPLICATE'
  | 'WAITING_PREDECESSOR'
  | 'BUFFER_FLUSHED'
  | 'LATE_TTL_EXPIRED'
  | 'JOURNEY_STAGE_DUPLICATED'
  | 'SESSION_MISMATCH'
  | 'MIGRATION_RENAME'
  | 'MIGRATION_SPLIT'
  | 'MIGRATION_GAP'
  | 'ACCEPTED';

export interface Reason {
  code: ReasonCode;
  message: string;
}

export type ImpactTarget =
  | 'session'
  | 'experiment'
  | 'attribution'
  | 'conversion'
  | 'downstream';

export interface Impact {
  target: ImpactTarget;
  effect: 'ok' | 'degraded' | 'blocked' | 'pending';
  detail: string;
}

/** 流入下游的归一化事件（永远不含被禁字段） */
export interface NormalizedEvent {
  id: string;
  schemaVersion: string;
  name: string;
  distinctId?: string;
  sessionId?: string;
  ts: number;
  props: Record<string, unknown>;
  migratedFrom?: string;
  transformedVia: string[];
}

export interface StepRecord {
  index: number;
  eventId: string;
  rawName: string;
  source: 'v1-sdk' | 'v2-sdk';
  status: StepStatus;
  reasons: Reason[];
  impacts: Impact[];
  arrivalMs: number;
  ts: number;
  /** 进入下游的归一化事件；waiting/blocked/invalid 为 undefined */
  normalized?: NormalizedEvent;
  /** 是否由乱序缓冲释放得到 */
  flushed: boolean;
  /** 该事件被缓冲时记录的到达序号（释放时回填） */
  bufferedFromIndex?: number;
}

// ── 链路状态 ─────────────────────────────────────────────────

export interface LinkageState {
  session:
    | { status: 'linked'; sessionId: string; source: string }
    | { status: 'mismatch'; detail: string }
    | { status: 'gap'; detail: string }
    | { status: 'idle' };
  experiment:
    | { status: 'complete'; experimentId: string; variant: string; source: string }
    | { status: 'variant-only'; variant: string; detail: string }
    | { status: 'gap'; detail: string }
    | { status: 'idle' };
  attribution:
    | { status: 'attributed'; utmSource: string; utmCampaign?: string; source: string }
    | { status: 'partial'; detail: string }
    | { status: 'gap'; detail: string }
    | { status: 'idle' };
  conversion:
    | { status: 'attributed'; eventId: string; detail: string }
    | { status: 'partial'; eventId: string; detail: string }
    | { status: 'unattributed'; eventId: string; detail: string }
    | { status: 'blocked'; detail: string }
    | { status: 'idle' };
}

export interface StageInfo {
  reached: boolean;
  eventId?: string;
  at?: number;
}

export interface JourneySnapshot {
  userId: string;
  stages: Record<JourneyStageKey, StageInfo>;
  linkage: LinkageState;
  /** 仍在缓冲中等待的事件 id */
  waiting: string[];
  /** 已进入下游的归一化事件 id 顺序 */
  downstreamIds: string[];
  finished: boolean;
}
