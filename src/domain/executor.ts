// 状态化旅程执行器
//
// 每“到”一个事件，执行器按固定管线推进状态：
//   未知版本 → 隐私拦截 → 去重 → 版本适配/校验 → 旅程乱序缓冲（含等待窗口）
// → 入下游 → 更新会话关联 / 实验分组 / 转化归因。
// 结论来自这台状态机，而不是“校验 JSON 后排序”。
import type {
  ContractBundle,
  Impact,
  JourneySnapshot,
  JourneyStageKey,
  LinkageState,
  NormalizedEvent,
  RawEvent,
  Reason,
  StepRecord,
} from './types';
import { applyPrivacy, leaksPrivacy } from './privacy';
import { adaptV1Event, findEventContract, findProtocol } from './migration';
import { validateProps } from './validation';

interface BufferedItem {
  ev: RawEvent;
  arrivalIndex: number;
  arrivalMs: number;
}

interface SeenEntry {
  ids: Set<string>;
}

const STAGE_ORDER: JourneyStageKey[] = ['trial', 'project', 'publish'];

export class JourneyExecutor {
  private bundle: ContractBundle;
  /** 到达时间轴（ms），由 arrivalDelayMs 累加得到 */
  private clock = 0;
  private stepIndex = 0;
  private seen = new Map<string, SeenEntry>();
  private buffer: BufferedItem[] = [];
  private downstream: NormalizedEvent[] = [];
  private stages = new Map<JourneyStageKey, { eventId: string; at: number }>();
  private linkage: LinkageState = {
    session: { status: 'idle' },
    experiment: { status: 'idle' },
    attribution: { status: 'idle' },
    conversion: { status: 'idle' },
  };
  /** 会话基准：首个接受事件的 distinctId + sessionId */
  private baseUser: { distinctId?: string; sessionId?: string } = {};

  constructor(bundle: ContractBundle) {
    this.bundle = bundle;
  }

  snapshot(): JourneySnapshot {
    const stages = {
      trial: { reached: false },
      project: { reached: false },
      publish: { reached: false },
    } as JourneySnapshot['stages'];
    for (const key of STAGE_ORDER) {
      const hit = this.stages.get(key);
      if (hit) stages[key] = { reached: true, eventId: hit.eventId, at: hit.at };
    }
    return {
      userId: this.baseUser.distinctId ?? 'anonymous',
      stages,
      linkage: structuredCloneSafe(this.linkage),
      waiting: this.buffer.map((b) => b.ev.id),
      downstreamIds: this.downstream.map((d) => d.id),
      finished: this.stages.has('publish'),
    };
  }

  /** 处理一个按“到达顺序”喂入的事件；一次到达可能释放缓冲，故返回多条记录 */
  ingest(ev: RawEvent): StepRecord[] {
    const arrivalMs = this.advanceClock(ev);
    const records: StepRecord[] = [];

    // 1) 版本边界
    const protocol = findProtocol(this.bundle.protocols, ev.schemaVersion);
    if (!protocol) {
      records.push(this.record(ev, arrivalMs, 'invalid', [
        { code: 'UNKNOWN_VERSION', message: `协议版本 v${ev.schemaVersion} 不在受支持契约内，拒绝接收` },
      ], [
        { target: 'downstream', effect: 'blocked', detail: '未知版本事件不进入下游' },
        { target: 'attribution', effect: 'blocked', detail: '无法参与归因' },
      ]));
      this.expireBufferIfNeeded(records);
      return records;
    }

    // 2) 隐私：整条禁采
    const privacyResult = applyPrivacy(this.bundle.privacy, ev);
    if (privacyResult.eventDenied) {
      records.push(this.record(ev, arrivalMs, 'blocked', [
        {
          code: 'PRIVACY_EVENT_BLOCKED',
          message: `事件 ${ev.name} 属禁止采集名单，整条拦截，不产生任何下游记录`,
        },
      ], [
        { target: 'downstream', effect: 'blocked', detail: '隐私事件不落下游、不进缓冲' },
        { target: 'conversion', effect: 'blocked', detail: '该事件不能计入转化' },
      ]));
      this.expireBufferIfNeeded(records);
      return records;
    }

    // 3) 去重（同一事件 ID 再次到达即丢弃，忽略不计）
    const userKey = ev.distinctId ?? 'anonymous';
    let bucket = this.seen.get(userKey);
    if (!bucket) {
      bucket = { ids: new Set() };
      this.seen.set(userKey, bucket);
    }
    if (bucket.ids.has(ev.id)) {
      records.push(this.record(ev, arrivalMs, 'invalid', [
        { code: 'DUPLICATE', message: `事件 ${ev.id} 已处理过，重复上报幂等丢弃` },
      ], [
        { target: 'conversion', effect: 'ok', detail: '重复不二次计入转化' },
        { target: 'downstream', effect: 'blocked', detail: '重复事件不进入下游' },
      ]));
      this.expireBufferIfNeeded(records);
      return records;
    }

    // 4) 适配 + 契约校验（隐私字段先剥离，再送适配/校验）
    let normalizedName: string;
    let workProps: Record<string, unknown>;
    const transformReasons: Reason[] = [];
    const transformVia: string[] = [];

    const strippedReasons: Reason[] = privacyResult.strippedFields.map((f) => ({
      code: 'PII_FIELD_STRIPPED',
      message: `禁采字段 ${f} 已在入口剥离，不会流入下游`,
    }));
    const cleanEv: RawEvent = { ...ev, props: privacyResult.cleanProps };

    if (ev.source === 'v1-sdk' || String(ev.schemaVersion) === this.bundle.migration.fromVersion) {
      const adapted = adaptV1Event(cleanEv, this.bundle.migration);
      if (adapted.name === null) {
        records.push(this.record(ev, arrivalMs, 'invalid', [
          ...strippedReasons,
          { code: 'UNKNOWN_EVENT', message: `v1 事件 ${ev.name} 没有迁移映射，无法归一化到 v2` },
        ], [
          { target: 'downstream', effect: 'blocked', detail: '无映射的旧事件被拒收' },
        ]));
        this.expireBufferIfNeeded(records);
        return records;
      }
      normalizedName = adapted.name;
      workProps = adapted.props;
      transformVia.push(...adapted.transformedVia);
      for (const note of adapted.notes) {
        if (note.kind === 'rename') transformReasons.push({ code: 'MIGRATION_RENAME', message: note.message });
        if (note.kind === 'split') transformReasons.push({ code: 'MIGRATION_SPLIT', message: note.message });
        if (note.kind === 'gap') transformReasons.push({ code: 'MIGRATION_GAP', message: note.message });
        if (note.kind === 'dropPii') transformReasons.push({ code: 'PII_FIELD_STRIPPED', message: note.message });
      }
    } else {
      // v2 原生事件：名称即归一化名
      if (!findEventContract(protocol, ev.name)) {
        records.push(this.record(ev, arrivalMs, 'invalid', [
          ...strippedReasons,
          { code: 'UNKNOWN_EVENT', message: `v2 事件 ${ev.name} 不在契约内` },
        ], [
          { target: 'downstream', effect: 'blocked', detail: '未知事件拒收' },
        ]));
        this.expireBufferIfNeeded(records);
        return records;
      }
      normalizedName = ev.name;
      workProps = { ...cleanEv.props };
    }

    const v2Protocol = this.bundle.protocols.find((p) => p.version === this.bundle.migration.toVersion)!;
    const isAdaptedV1 = ev.source === 'v1-sdk' || String(ev.schemaVersion) === this.bundle.migration.fromVersion;
    const validation = validateProps(v2Protocol, normalizedName, workProps);

    if (isAdaptedV1) {
      // 严格性只约束原生 v2 生产方：v1 适配负载中的遗留字段不阻断迁移，
      // 剥离并告警（旧版 SDK 还要运行一段时间，不能因历史包袱卡死接收）
      const strictUnknown = validation.blocking.filter((i) => i.kind === 'STRICT_UNKNOWN_FIELD');
      for (const issue of strictUnknown) {
        if (issue.field) delete workProps[issue.field];
      }
      if (strictUnknown.length > 0) {
        for (const issue of strictUnknown) {
          transformReasons.push({
            code: 'LENIENT_UNKNOWN_FIELD',
            message: `旧版遗留字段 ${issue.field} 不在 v2 契约内，已剥离（不阻断旧版接收）`,
          });
        }
      }
    }

    // 重新校验：适配分支剥离遗留字段后，只剩真正的缺失/类型问题才阻断
    const revalidation = isAdaptedV1 ? validateProps(v2Protocol, normalizedName, workProps) : validation;
    if (revalidation.blocking.length > 0) {
      const reasons: Reason[] = [...strippedReasons, ...transformReasons];
      for (const issue of revalidation.blocking) {
        reasons.push({ code: issue.kind, message: issue.message });
      }
      for (const issue of revalidation.warnings) {
        reasons.push({ code: 'LENIENT_UNKNOWN_FIELD', message: issue.message });
      }
      // 旧版适配不伪造：gap 字段导致必填缺失 → 阻断，并说明归因受损
      const missingAttribution = revalidation.blocking.some(
        (i) => i.kind === 'MISSING_FIELD' && /utm|experiment|variant/i.test(i.field ?? ''),
      );
      records.push(this.record(ev, arrivalMs, 'blocked', reasons, [
        { target: 'downstream', effect: 'blocked', detail: '契约校验未过，事件不下发' },
        {
          target: 'attribution',
          effect: missingAttribution ? 'degraded' : 'ok',
          detail: missingAttribution ? '归因关键字段缺失（旧版未采集，未伪造），该事件无法完成归因' : '不影响归因链路',
        },
      ]));
      // 阻断事件仍登记为“见过”，避免重试绕过；且不进缓冲
      bucket.ids.add(ev.id);
      this.expireBufferIfNeeded(records);
      return records;
    }

    // 校验通过 → 登记幂等
    bucket.ids.add(ev.id);

    const warningReasons: Reason[] = [
      ...strippedReasons,
      ...transformReasons,
      ...revalidation.warnings.map((w) => ({ code: 'LENIENT_UNKNOWN_FIELD' as const, message: w.message })),
    ];

    // 5) 旅程乱序缓冲：阶段必须按序到达
    const expectedIndex = this.nextExpectedStageIndex();
    const hereIndex = this.bundle.journey.stages.findIndex((s) => s.event === normalizedName);

    if (hereIndex === -1) {
      // 非旅程事件：直接下游（仍参与关联），不影响阶段推进
      const normalized = this.buildNormalized(ev, normalizedName, workProps, transformVia);
      records.push(this.accept(ev, arrivalMs, normalized, warningReasons, false, '非旅程事件，直接下发'));
      this.updateLinkage(normalized);
      this.downstream.push(normalized);
      this.expireBufferIfNeeded(records);
      return records;
    }

    if (hereIndex < expectedIndex) {
      // 已完成阶段的同阶段事件（按 id 去重外的另一条同事件名上报）→ 阶段重复
      const mismatchReason = this.evalSessionMismatch(ev);
      records.push(this.record(ev, arrivalMs, 'invalid', [
        {
          code: 'JOURNEY_STAGE_DUPLICATED',
          message: `阶段「${this.stageLabel(hereIndex)}」已完成，迟到的同阶段事件不再推进旅程`,
        },
        ...(mismatchReason ? [mismatchReason] : []),
      ], [
        { target: 'conversion', effect: 'ok', detail: '不重复计入转化' },
        ...(mismatchReason
          ? [{ target: 'session' as const, effect: 'degraded' as const, detail: '该事件会话与已建立会话不一致' }]
          : []),
      ]));
      this.expireBufferIfNeeded(records);
      return records;
    }

    if (hereIndex > expectedIndex) {
      // 前置阶段缺失 → 缓冲等待（同时让更早的滞留项接受 TTL 检查）
      this.buffer.push({ ev, arrivalIndex: this.stepIndex - 1, arrivalMs });
      this.expireBufferIfNeeded(records);
      const waitMs = this.bundle.journey.maxWaitMs;
      records.push(this.record(ev, arrivalMs, 'waiting', [
        {
          code: 'WAITING_PREDECESSOR',
          message: `先等「${this.stageLabel(expectedIndex)}」；事件进入乱序缓冲，窗口 ${waitMs}ms`,
        },
      ], [
        { target: 'conversion', effect: 'pending', detail: '前置未完成，转化暂不计入' },
        { target: 'downstream', effect: 'pending', detail: '缓冲中，尚未下发' },
      ]));
      return records;
    }

    // hereIndex === expectedIndex：命中当前阶段，接受并尝试级联释放缓冲
    // 先清理已超 TTL 的滞留项，再释放紧随其后的等待事件
    this.expireBufferIfNeeded(records);
    const normalized = this.buildNormalized(ev, normalizedName, workProps, transformVia);
    const first = this.accept(ev, arrivalMs, normalized, warningReasons, false, '命中当前旅程阶段');
    this.commitStage(normalized, hereIndex);
    records.push(first);
    this.drainBuffer(records, arrivalMs);
    return records;
  }

  /** 输入流封口：不会再有事件到达，仍滞留缓冲的项全部失效（区别于窗口超时） */
  seal(): StepRecord[] {
    if (this.buffer.length === 0) return [];
    const records: StepRecord[] = [];
    const pending = this.buffer.splice(0, this.buffer.length);
    for (const item of pending) {
      records.push(this.record(item.ev, item.arrivalMs, 'invalid', [
        {
          code: 'BUFFER_FLUSHED',
          message: `输入流已结束，前置阶段仍未补齐，缓冲项 ${item.ev.name} 永久失效`,
        },
      ], [
        { target: 'downstream', effect: 'blocked', detail: '流结束未成链，不下发' },
        { target: 'conversion', effect: 'blocked', detail: '旅程未闭合，转化不计入' },
      ]));
    }
    return records;
  }

  // ── 内部实现 ───────────────────────────────────────────────

  private advanceClock(ev: RawEvent): number {
    const delay = Math.max(0, ev.arrivalDelayMs ?? 0);
    this.clock += delay;
    return this.clock;
  }

  private nextExpectedStageIndex(): number {
    for (let i = 0; i < STAGE_ORDER.length; i++) {
      if (!this.stages.has(STAGE_ORDER[i])) return i;
    }
    return STAGE_ORDER.length;
  }

  private stageLabel(index: number): string {
    return this.bundle.journey.stages[index]?.label ?? `阶段${index + 1}`;
  }

  /** 会话一致性检查：已建立会话后，sessionId 不一致即记为 mismatch */
  private evalSessionMismatch(ev: RawEvent): Reason | null {
    const current = this.linkage.session;
    if (ev.sessionId && current.status === 'linked' && current.sessionId !== ev.sessionId) {
      this.linkage.session = {
        status: 'mismatch',
        detail: `${ev.id} 携带 sessionId=${ev.sessionId}，与已建立会话 ${current.sessionId} 不一致`,
      };
      return {
        code: 'SESSION_MISMATCH',
        message: `跨会话事件：sessionId=${ev.sessionId} 与当前会话 ${current.sessionId} 不一致，不能并入本用户旅程`,
      };
    }
    return null;
  }

  private drainBuffer(records: StepRecord[], now: number): void {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const expectedIndex = this.nextExpectedStageIndex();
      const idx = this.buffer.findIndex((b) => {
        const name = this.normalizedNameOf(b.ev);
        return this.bundle.journey.stages.findIndex((s) => s.event === name) === expectedIndex;
      });
      if (idx === -1) break;
      const [{ ev, arrivalIndex, arrivalMs: bufferedArrival }] = this.buffer.splice(idx, 1);
      // 重新走一遍适配（缓冲事件是合法通过校验后才入队的，这里直接重建负载）
      const built = this.rebuildNormalized(ev);
      const rec = this.accept(
        ev,
        now,
        built.normalized,
        built.reasons,
        true,
        `前置阶段补齐，缓冲释放（原到达时刻 ${bufferedArrival}ms）`,
        arrivalIndex,
      );
      this.commitStage(built.normalized, expectedIndex);
      records.push(rec);
      progressed = true;
    }
  }

  /** 等待窗口超时：仍滞留缓冲的事件失效，不下发、不计转化 */
  private expireBufferIfNeeded(records: StepRecord[]): void {
    if (this.buffer.length === 0) return;
    const waitMs = this.bundle.journey.maxWaitMs;
    const remaining: BufferedItem[] = [];
    for (const item of this.buffer) {
      if (this.clock - item.arrivalMs >= waitMs) {
        records.push(this.record(item.ev, item.arrivalMs, 'invalid', [
          {
            code: 'LATE_TTL_EXPIRED',
            message: `在缓冲中等待前置阶段超过 ${waitMs}ms，事件失效（${this.clock - item.arrivalMs}ms 仍未补齐）`,
          },
          { code: 'BUFFER_FLUSHED', message: '乱序缓冲项被清除，不进入下游' },
        ], [
          { target: 'downstream', effect: 'blocked', detail: '超时失效，不下发' },
          { target: 'conversion', effect: 'blocked', detail: '旅程断裂，无法计入转化' },
        ]));
      } else {
        remaining.push(item);
      }
    }
    this.buffer = remaining;
  }

  private normalizedNameOf(ev: RawEvent): string {
    if (ev.source === 'v1-sdk' || String(ev.schemaVersion) === this.bundle.migration.fromVersion) {
      const map = this.bundle.migration.events.find((m) => m.fromEvent === ev.name);
      return map?.toEvent ?? ev.name;
    }
    return ev.name;
  }

  private rebuildNormalized(ev: RawEvent): {
    normalized: NormalizedEvent;
    reasons: Reason[];
  } {
    const privacyResult = applyPrivacy(this.bundle.privacy, ev);
    const cleanEv: RawEvent = { ...ev, props: privacyResult.cleanProps };
    const reasons: Reason[] = privacyResult.strippedFields.map((f) => ({
      code: 'PII_FIELD_STRIPPED',
      message: `禁采字段 ${f} 已在入口剥离，不会流入下游`,
    }));
    if (ev.source === 'v1-sdk' || String(ev.schemaVersion) === this.bundle.migration.fromVersion) {
      const adapted = adaptV1Event(cleanEv, this.bundle.migration);
      for (const note of adapted.notes) {
        if (note.kind === 'rename') reasons.push({ code: 'MIGRATION_RENAME', message: note.message });
        if (note.kind === 'split') reasons.push({ code: 'MIGRATION_SPLIT', message: note.message });
        if (note.kind === 'gap') reasons.push({ code: 'MIGRATION_GAP', message: note.message });
        if (note.kind === 'dropPii') reasons.push({ code: 'PII_FIELD_STRIPPED', message: note.message });
      }
      return {
        normalized: this.buildNormalized(ev, adapted.name!, adapted.props, adapted.transformedVia),
        reasons,
      };
    }
    return {
      normalized: this.buildNormalized(ev, ev.name, { ...cleanEv.props }, []),
      reasons,
    };
  }

  private buildNormalized(
    ev: RawEvent,
    name: string,
    props: Record<string, unknown>,
    via: string[],
  ): NormalizedEvent {
    // 最后一道防线：确认没有禁采字段混入
    const leaked = leaksPrivacy(this.bundle.privacy, props);
    const safeProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!leaked.includes(k)) safeProps[k] = v;
    }
    return {
      id: ev.id,
      schemaVersion: this.bundle.migration.toVersion,
      name,
      distinctId: ev.distinctId,
      sessionId: ev.sessionId,
      ts: ev.ts,
      props: safeProps,
      migratedFrom: ev.source === 'v1-sdk' ? ev.name : undefined,
      transformedVia: via,
    };
  }

  private commitStage(normalized: NormalizedEvent, stageIndex: number): void {
    const key = STAGE_ORDER[stageIndex];
    if (!this.stages.has(key)) {
      this.stages.set(key, { eventId: normalized.id, at: normalized.ts });
    }
    this.downstream.push(normalized);
    this.updateLinkage(normalized);
    if (key === 'publish') {
      this.resolveConversion(normalized);
    }
  }

  private updateLinkage(n: NormalizedEvent): void {
    // 会话关联：同一 distinctId 下 sessionId 必须一致
    if (!this.baseUser.distinctId && n.distinctId) {
      this.baseUser = { distinctId: n.distinctId, sessionId: n.sessionId };
    }
    if (n.sessionId) {
      if (this.linkage.session.status !== 'linked') {
        this.linkage.session = {
          status: 'linked',
          sessionId: n.sessionId,
          source: `${n.name}(${n.id})`,
        };
      } else if (this.linkage.session.sessionId !== n.sessionId) {
        this.linkage.session = {
          status: 'mismatch',
          detail: `${n.id} 携带 sessionId=${n.sessionId}，与已建立会话 ${this.linkage.session.sessionId} 不一致`,
        };
      }
    }

    // 实验分组：experiment_id + variant 同时齐备才算完整
    const expId = n.props.experiment_id;
    const variant = n.props.variant;
    if (typeof expId === 'string' && typeof variant === 'string') {
      this.linkage.experiment = {
        status: 'complete',
        experimentId: expId,
        variant,
        source: `${n.name}(${n.id})`,
      };
    } else if (typeof variant === 'string' && this.linkage.experiment.status === 'idle') {
      this.linkage.experiment = {
        status: 'variant-only',
        variant,
        detail: `${n.id} 只带了 variant，缺 experiment_id（旧版未采集且未伪造），无法确定实验`,
      };
    }

    // 转化归因：utm_source 是关键键（v1 的 referrer 经改名得到）
    const utmSource = n.props.utm_source;
    const utmCampaign = n.props.utm_campaign;
    if (typeof utmSource === 'string') {
      this.linkage.attribution = {
        status: 'attributed',
        utmSource,
        utmCampaign: typeof utmCampaign === 'string' ? utmCampaign : undefined,
        source: `${n.name}(${n.id})`,
      };
    } else if (n.name === 'trial_started' && this.linkage.attribution.status === 'idle') {
      this.linkage.attribution = {
        status: 'gap',
        detail: '开通试用事件缺少 utm_source（v1 未采集 referrer 或字段丢失），首触归因缺失',
      };
    }
  }

  private resolveConversion(publish: NormalizedEvent): void {
    const sessionOk = this.linkage.session.status === 'linked';
    switch (this.linkage.attribution.status) {
      case 'attributed':
        this.linkage.conversion = {
          status: 'attributed',
          eventId: publish.id,
          detail: sessionOk
            ? `首次发布已归因到 ${this.linkage.attribution.utmSource}，会话链路完整`
            : `发布已归因到 ${this.linkage.attribution.utmSource}，但会话关联异常`,
        };
        break;
      case 'partial':
        this.linkage.conversion = {
          status: 'partial',
          eventId: publish.id,
          detail: '发布完成，但归因信息不完整',
        };
        break;
      default:
        this.linkage.conversion = {
          status: 'unattributed',
          eventId: publish.id,
          detail: '首次发布到达，但试用阶段归因缺失（字段改名后旧事件丢了归因关系），转化无法回溯渠道',
        };
    }
  }

  private accept(
    ev: RawEvent,
    arrivalMs: number,
    normalized: NormalizedEvent,
    extraReasons: Reason[],
    flushed: boolean,
    message: string,
    bufferedFromIndex?: number,
  ): StepRecord {
    return this.record(
      ev,
      arrivalMs,
      'accepted',
      [...extraReasons, { code: 'ACCEPTED', message }],
      this.acceptImpacts(normalized, flushed),
      normalized,
      flushed,
      bufferedFromIndex,
    );
  }

  private acceptImpacts(n: NormalizedEvent, flushed: boolean): Impact[] {
    const impacts: Impact[] = [
      {
        target: 'downstream',
        effect: 'ok',
        detail: flushed ? '乱序补齐后下发（顺序已修正）' : '归一化事件进入下游',
      },
    ];
    if (typeof n.props.utm_source === 'string') {
      impacts.push({ target: 'attribution', effect: 'ok', detail: `归因渠道 ${n.props.utm_source} 已建立` });
    }
    if (typeof n.props.variant === 'string') {
      impacts.push({ target: 'experiment', effect: typeof n.props.experiment_id === 'string' ? 'ok' : 'degraded', detail: typeof n.props.experiment_id === 'string' ? '实验分组完整' : '仅 variant，实验未知' });
    }
    if (n.name === 'project_published') {
      impacts.push({ target: 'conversion', effect: 'ok', detail: '首次发布计入转化' });
    }
    return impacts;
  }

  private record(
    ev: RawEvent,
    arrivalMs: number,
    status: StepRecord['status'],
    reasons: Reason[],
    impacts: Impact[],
    normalized?: NormalizedEvent,
    flushed = false,
    bufferedFromIndex?: number,
  ): StepRecord {
    return {
      index: this.stepIndex++,
      eventId: ev.id,
      rawName: ev.name,
      source: ev.source,
      status,
      reasons,
      impacts,
      arrivalMs,
      ts: ev.ts,
      normalized,
      flushed,
      bufferedFromIndex,
    };
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 便捷入口：喂入一串按到达顺序排列的事件，流结束自动封口，得到全部步骤与终态 */
export function runReplay(bundle: ContractBundle, events: RawEvent[]): {
  steps: StepRecord[];
  snapshot: JourneySnapshot;
} {
  const executor = new JourneyExecutor(bundle);
  const steps: StepRecord[] = [];
  for (const ev of events) {
    steps.push(...executor.ingest(ev));
  }
  steps.push(...executor.seal());
  return { steps, snapshot: executor.snapshot() };
}
