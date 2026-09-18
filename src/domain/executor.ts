import { adaptEvent, scanPrivacy } from './adapter';
import type {
  AdaptedEvent,
  EventContract,
  ExecutorState,
  JourneyDef,
  RawEvent,
  StepRecord,
} from './types';

/**
 * 状态化旅程执行器。
 *
 * 不是"校验 JSON 再排序"：每条事件按到达顺序经过
 *   隐私闸口 → 幂等去重 → 契约适配 → 旅程状态机
 * 并就地更新会话关联、实验分组、转化归因三份影响台账。
 *
 * 纯函数折叠（fold）：同一（契约, 事件序列）必得同一状态，
 * 因此撤销/重做/刷新恢复都只是重放前缀。
 */
export function createExecutorState(journey: JourneyDef): ExecutorState {
  return {
    stepIndex: 0,
    steps: journey.steps.map((def) => ({ def, status: 'pending', recordSeq: null, note: null })),
    status: 'running',
    seenEventIds: new Map(),
    buffered: [],
    records: [],
    downstream: [],
    session: { current: null, sessions: [], switches: 0, unknownEvents: 0 },
    experiment: { variant: null, missingEvents: 0, conflicts: 0 },
    attribution: { status: 'intact', chain: [] },
    privacyBlocks: 0,
    lastTimestamp: null,
  };
}

export function foldEvents(
  contract: EventContract,
  journey: JourneyDef,
  events: RawEvent[],
): ExecutorState {
  const state = createExecutorState(journey);
  for (const e of events) applyEvent(contract, journey, state, e);
  return state;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** 处理单条事件（就地修改 state；仅在 fold 内部使用） */
export function applyEvent(
  contract: EventContract,
  journey: JourneyDef,
  state: ExecutorState,
  raw: RawEvent,
): void {
  const record: StepRecord = {
    seq: state.records.length,
    event: raw,
    adapted: null,
    verdict: 'invalid',
    reasons: [],
    impacts: [],
    stepId: null,
  };

  // 1. 隐私闸口：命中禁采字段 → 阻断，不适配、不进下游、不动旅程
  const hits = scanPrivacy(contract, raw);
  if (hits.length > 0) {
    record.verdict = 'blocked';
    record.reasons.push(`命中禁止采集字段：${hits.join('、')}`);
    record.impacts.push({
      area: 'privacy',
      level: 'bad',
      text: '事件在入闸处被阻断：未适配、未进入下游，旅程状态不变',
    });
    state.privacyBlocks += 1;
    state.records.push(record);
    return;
  }

  // 2. 幂等去重：同一 eventId 只处理一次
  const seenAt = state.seenEventIds.get(raw.eventId);
  if (seenAt !== undefined) {
    record.verdict = 'duplicate';
    record.reasons.push(`eventId「${raw.eventId}」已在第 ${seenAt + 1} 条处理过，幂等去重`);
    record.impacts.push({ area: 'journey', level: 'info', text: '重复投递被忽略，旅程与下游不受影响' });
    state.records.push(record);
    return;
  }
  state.seenEventIds.set(raw.eventId, record.seq);

  // 3. 契约适配（v1→v2 迁移 / v2 校验）
  const adapted = adaptEvent(contract, raw);
  record.adapted = adapted;
  record.reasons.push(...adapted.notes);

  if (adapted.fatal.length > 0) {
    record.verdict = 'invalid';
    record.reasons.push(...adapted.fatal);
    const cur = journey.steps[state.stepIndex];
    if (state.status === 'running' && cur && cur.expects === adapted.name) {
      // 当前步骤的期望事件本身失效 → 步骤失效，旅程断裂
      record.stepId = cur.id;
      const st = state.steps[state.stepIndex];
      st.status = 'invalidated';
      st.recordSeq = record.seq;
      st.note = adapted.fatal.join('；');
      state.status = 'failed';
      record.impacts.push({
        area: 'journey',
        level: 'bad',
        text: `步骤「${cur.title}」失效，旅程断裂。可撤销、调整契约后重放或重置`,
      });
    } else {
      record.impacts.push({ area: 'journey', level: 'warn', text: '事件被丢弃，旅程状态不变' });
    }
    state.records.push(record);
    return;
  }

  // 4. 旅程状态机
  const stepIdx = journey.steps.findIndex((s) => s.expects === adapted.name);
  if (stepIdx === -1) {
    record.verdict = 'invalid';
    record.reasons.push(`事件「${adapted.name}」不在旅程定义中，不进入下游`);
    state.records.push(record);
    return;
  }
  record.stepId = journey.steps[stepIdx].id;

  if (state.status === 'failed') {
    record.verdict = 'waiting';
    record.reasons.push('旅程已断裂，事件进入缓冲，等待人工处理（撤销 / 调整契约 / 重置）');
    state.buffered.push({ record, adapted, stepIdx });
    state.records.push(record);
    return;
  }
  if (state.status === 'completed') {
    record.verdict = 'duplicate';
    record.reasons.push('旅程已完成，后续事件视为冗余投递，不进入下游');
    state.records.push(record);
    return;
  }
  if (stepIdx < state.stepIndex) {
    record.verdict = 'duplicate';
    record.reasons.push(`步骤「${journey.steps[stepIdx].title}」已完成，视为语义重复，幂等忽略`);
    state.records.push(record);
    return;
  }
  if (stepIdx > state.stepIndex) {
    record.verdict = 'waiting';
    record.reasons.push(
      `早于前序步骤「${journey.steps[state.stepIndex].title}」到达，进入乱序缓冲（第 ${state.buffered.length + 1} 个等待者）`,
    );
    record.impacts.push({
      area: 'journey',
      level: 'warn',
      text: '若前序事件随后到达，本事件将按到达顺序自动补放',
    });
    state.buffered.push({ record, adapted, stepIdx });
    state.records.push(record);
    return;
  }

  // 5. 命中当前步骤 → 接受，并尝试补放缓冲区
  acceptRecord(contract, journey, state, record, adapted, stepIdx);
  state.records.push(record);
  flushBuffer(contract, journey, state);
}

function flushBuffer(contract: EventContract, journey: JourneyDef, state: ExecutorState): void {
  for (;;) {
    if (state.status !== 'running') return;
    const i = state.buffered.findIndex((b) => b.stepIdx === state.stepIndex);
    if (i < 0) return;
    const [b] = state.buffered.splice(i, 1);
    b.record.reasons.push('前序步骤已到达，缓冲事件按到达顺序补放');
    acceptRecord(contract, journey, state, b.record, b.adapted, b.stepIdx);
  }
}

function acceptRecord(
  contract: EventContract,
  journey: JourneyDef,
  state: ExecutorState,
  record: StepRecord,
  adapted: AdaptedEvent,
  stepIdx: number,
): void {
  record.verdict = 'accepted';
  const step = journey.steps[stepIdx];
  record.stepId = step.id;
  const st = state.steps[stepIdx];
  st.status = 'accepted';
  st.recordSeq = record.seq;
  state.stepIndex = stepIdx + 1;
  if (state.stepIndex >= journey.steps.length) state.status = 'completed';
  record.reasons.push(`匹配步骤「${step.title}」，事件接受并进入下游`);

  // 时间戳乱序仅作标注：验收以到达顺序为准
  if (state.lastTimestamp !== null && adapted.timestamp < state.lastTimestamp) {
    const delta = state.lastTimestamp - adapted.timestamp;
    const within = delta <= contract.orderToleranceMs;
    record.reasons.push(
      `时间戳早于上一已接受事件 ${delta}ms（${within ? '在' : '超出'}容忍窗口 ${contract.orderToleranceMs}ms），以到达顺序为准`,
    );
  }
  state.lastTimestamp = Math.max(state.lastTimestamp ?? adapted.timestamp, adapted.timestamp);

  state.downstream.push(adapted);

  // —— 影响台账：会话关联 ——
  const uid = strOrNull(adapted.fields.user_id);
  const sid = strOrNull(adapted.fields.session_id);
  const variant = strOrNull(adapted.fields.experiment_variant);

  if (!sid) {
    state.session.unknownEvents += 1;
    record.impacts.push({
      area: 'session',
      level: 'warn',
      text: '缺少 session_id：无法并入任何会话，会话关联中断（未伪造）',
    });
  } else if (state.session.current === null) {
    state.session.current = sid;
    state.session.sessions.push(sid);
  } else if (state.session.current !== sid) {
    state.session.switches += 1;
    state.session.current = sid;
    state.session.sessions.push(sid);
    record.impacts.push({ area: 'session', level: 'warn', text: `会话切换 → ${sid}：跨会话关联需人工确认` });
  }

  // —— 影响台账：实验分组 ——
  if (!variant) {
    state.experiment.missingEvents += 1;
    record.impacts.push({
      area: 'experiment',
      level: 'warn',
      text: '缺少 experiment_variant：本事件不进入实验分组统计',
    });
  } else if (state.experiment.variant === null) {
    state.experiment.variant = variant;
  } else if (state.experiment.variant !== variant) {
    state.experiment.conflicts += 1;
    record.impacts.push({
      area: 'experiment',
      level: 'bad',
      text: `实验串组：${state.experiment.variant} → ${variant}，分组结论不可信`,
    });
  }

  // —— 影响台账：转化归因 ——
  const problems: string[] = [];
  const anchor = state.attribution.chain[0];
  if (!anchor) {
    if (!uid) problems.push('旅程锚点缺少用户标识');
    if (!sid) problems.push('旅程锚点缺少会话标识');
    if (!variant) problems.push('旅程锚点缺少实验变体');
  } else {
    if (uid && anchor.userId && uid !== anchor.userId) {
      problems.push(`用户标识变更 ${anchor.userId} → ${uid}`);
    }
    if (!sid) problems.push('会话标识缺失');
    else if (anchor.sessionId && sid !== anchor.sessionId) {
      problems.push(`会话不一致 ${anchor.sessionId} → ${sid}`);
    }
    if (anchor.variant && !variant) problems.push('实验变体丢失');
  }
  state.attribution.chain.push({ stepId: step.id, userId: uid, sessionId: sid, variant, problems });
  for (const p of problems) {
    record.impacts.push({
      area: 'attribution',
      level: p.includes('用户标识') ? 'bad' : 'warn',
      text: `转化归因：${p}`,
    });
  }
  const all = state.attribution.chain.flatMap((l) => l.problems);
  if (all.some((p) => p.includes('用户标识'))) {
    state.attribution.status = 'broken';
  } else if (all.length > 0) {
    state.attribution.status = 'degraded';
  }
}
