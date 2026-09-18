/**
 * EventContract 埋点迁移验收台 —— 领域模型类型定义。
 *
 * 核心概念：
 * - RawEvent：旧/新 SDK 上报的原始事件（字段原样保留，不做任何隐式修补）。
 * - EventContract：v1→v2 迁移契约（事件映射 / 字段改名 / 字段拆分 / 兼容规则 / 隐私禁采）。
 * - JourneyDef：用户旅程（开通试用 → 创建项目 → 首次发布）。
 * - ExecutorState：状态化旅程执行器的状态，由事件流折叠（fold）得出，可重放、可撤销。
 */

export type ProtocolVersion = 'v1' | 'v2';

export interface RawEvent {
  /** 到达序号（UI 用，每次注入/克隆都会变化） */
  id: string;
  /** SDK 幂等键：重复投递时 eventId 相同 */
  eventId: string;
  version: ProtocolVersion;
  name: string;
  /** 客户端时间戳（毫秒） */
  timestamp: number;
  fields: Record<string, unknown>;
}

/** 事件映射：v1 事件名 → v2 事件名 */
export interface EventMapRule {
  id: string;
  kind: 'event-map';
  enabled: boolean;
  from: string;
  to: string;
}

/** 字段改名：event 为 '*' 表示对所有 v1 事件生效 */
export interface RenameRule {
  id: string;
  kind: 'rename';
  enabled: boolean;
  event: string;
  from: string;
  to: string;
}

/** 字段拆分：如 plan_name "team/annual" → plan + billing_cycle */
export interface SplitRule {
  id: string;
  kind: 'split';
  enabled: boolean;
  event: string;
  from: string;
  to: [string, string];
  separator: string;
}

/**
 * 兼容规则：声明某 v2 字段在旧版可能缺失。
 * required=true 时缺失即失效（契约禁止伪造缺失信息）；
 * required=false 时事件被接受，但按 note 描述降级（如丢失实验分组）。
 */
export interface CompatRule {
  id: string;
  kind: 'compat';
  enabled: boolean;
  event: string;
  field: string;
  required: boolean;
  note: string;
}

export type ContractRule = EventMapRule | RenameRule | SplitRule | CompatRule;

export interface EventSchemaV2 {
  name: string;
  requiredFields: string[];
}

export interface EventContract {
  /** 所有 v2 事件公共必填字段（如 user_id） */
  commonRequired: string[];
  v2Events: EventSchemaV2[];
  rules: ContractRule[];
  /** 禁止采集字段（命中即阻断，不得流入下游） */
  forbiddenFields: string[];
  /** 时间戳乱序容忍窗口（毫秒），仅用于标注，不改变到达顺序语义 */
  orderToleranceMs: number;
}

export interface JourneyStepDef {
  id: string;
  title: string;
  /** 期望的 v2 事件名 */
  expects: string;
}

export interface JourneyDef {
  id: string;
  title: string;
  steps: JourneyStepDef[];
}

/** 处理结论：接受 / 等待 / 阻断 / 失效 / 重复 */
export type Verdict = 'accepted' | 'waiting' | 'blocked' | 'invalid' | 'duplicate';

/** v1 事件经契约适配后的形态（v2 事件做 schema 校验后也走此结构） */
export interface AdaptedEvent {
  sourceVersion: ProtocolVersion;
  name: string;
  timestamp: number;
  fields: Record<string, unknown>;
  /** 无法从原始数据派生、且契约禁止伪造的字段 */
  missing: string[];
  /** 适配过程说明（映射/改名/拆分/兼容命中） */
  notes: string[];
  /** 致命问题：存在即判定失效 */
  fatal: string[];
}

export type ImpactArea = 'session' | 'experiment' | 'attribution' | 'privacy' | 'journey';

export interface Impact {
  area: ImpactArea;
  level: 'info' | 'warn' | 'bad';
  text: string;
}

/** 单条事件的处理记录 */
export interface StepRecord {
  seq: number;
  event: RawEvent;
  adapted: AdaptedEvent | null;
  verdict: Verdict;
  reasons: string[];
  impacts: Impact[];
  stepId: string | null;
}

export type StepStatus = 'pending' | 'accepted' | 'invalidated';

export interface StepState {
  def: JourneyStepDef;
  status: StepStatus;
  /** 接受/失效该步骤的记录序号 */
  recordSeq: number | null;
  note: string | null;
}

export interface SessionImpactState {
  current: string | null;
  sessions: string[];
  switches: number;
  unknownEvents: number;
}

export interface ExperimentState {
  variant: string | null;
  missingEvents: number;
  conflicts: number;
}

export type AttributionStatus = 'intact' | 'degraded' | 'broken';

export interface AttributionLink {
  stepId: string;
  userId: string | null;
  sessionId: string | null;
  variant: string | null;
  problems: string[];
}

export interface AttributionState {
  status: AttributionStatus;
  chain: AttributionLink[];
}

export interface BufferedEvent {
  record: StepRecord;
  adapted: AdaptedEvent;
  stepIdx: number;
}

export interface ExecutorState {
  /** 当前等待的步骤下标 */
  stepIndex: number;
  steps: StepState[];
  status: 'running' | 'completed' | 'failed';
  /** eventId → 首次处理序号（幂等去重） */
  seenEventIds: Map<string, number>;
  /** 乱序/断裂时缓冲的事件 */
  buffered: BufferedEvent[];
  records: StepRecord[];
  /** 实际流入下游的事件（仅被接受的；阻断事件永不进入） */
  downstream: AdaptedEvent[];
  session: SessionImpactState;
  experiment: ExperimentState;
  attribution: AttributionState;
  privacyBlocks: number;
  lastTimestamp: number | null;
}
