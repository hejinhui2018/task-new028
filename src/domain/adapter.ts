import type {
  AdaptedEvent,
  EventContract,
  RawEvent,
} from './types';

/**
 * 隐私扫描：命中禁止采集字段（含一层嵌套）即返回路径列表。
 * 扫描发生在适配之前 —— 隐私事件连适配都不允许通过。
 */
export function scanPrivacy(contract: EventContract, raw: RawEvent): string[] {
  const forbidden = new Set(contract.forbiddenFields.map((f) => f.toLowerCase()));
  const hits: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (forbidden.has(k.toLowerCase())) {
        hits.push(path);
      } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, path);
      }
    }
  };
  walk(raw.fields, '');
  return hits;
}

/**
 * 契约适配：把 v1 事件迁移为 v2 形态；v2 事件做 schema 校验。
 *
 * 铁律：不伪造缺失信息。
 * - 拆分拆不出的部分 → 记入 missing，字段留空；
 * - 兼容规则命中的缺失字段 → 记入 missing，required 时记入 fatal；
 * - 未映射的 v1 字段原样保留并注明。
 */
export function adaptEvent(contract: EventContract, raw: RawEvent): AdaptedEvent {
  const notes: string[] = [];
  const missing: string[] = [];
  const fatal: string[] = [];
  let name = raw.name;
  const fields: Record<string, unknown> = { ...raw.fields };
  const enabled = contract.rules.filter((r) => r.enabled);
  const markMissing = (f: string) => {
    if (!missing.includes(f)) missing.push(f);
  };

  if (raw.version === 'v1') {
    const map = enabled.find((r) => r.kind === 'event-map' && r.from === raw.name);
    if (map && map.kind === 'event-map') {
      name = map.to;
      notes.push(`事件映射 ${raw.name} → ${map.to}`);
    } else {
      notes.push(`v1 事件「${raw.name}」无事件映射规则，按原名保留`);
    }

    for (const r of enabled) {
      if (r.kind !== 'rename') continue;
      if (r.event !== '*' && r.event !== raw.name) continue;
      if (r.from in fields) {
        fields[r.to] = fields[r.from];
        delete fields[r.from];
        notes.push(`字段改名 ${r.from} → ${r.to}`);
      }
    }

    for (const r of enabled) {
      if (r.kind !== 'split') continue;
      if (r.event !== '*' && r.event !== raw.name) continue;
      if (!(r.from in fields)) {
        markMissing(r.to[0]);
        markMissing(r.to[1]);
        notes.push(`拆分源字段 ${r.from} 缺失，${r.to.join(' / ')} 无法派生（不伪造）`);
        continue;
      }
      const v = fields[r.from];
      if (typeof v === 'string' && v.includes(r.separator)) {
        const idx = v.indexOf(r.separator);
        fields[r.to[0]] = v.slice(0, idx);
        fields[r.to[1]] = v.slice(idx + r.separator.length);
        delete fields[r.from];
        notes.push(`字段拆分 ${r.from} → ${r.to[0]} + ${r.to[1]}`);
      } else if (typeof v === 'string' && v.length > 0) {
        fields[r.to[0]] = v;
        delete fields[r.from];
        markMissing(r.to[1]);
        notes.push(`${r.from} 不含分隔符「${r.separator}」，${r.to[1]} 无法派生，留空不伪造`);
      } else {
        delete fields[r.from];
        markMissing(r.to[0]);
        markMissing(r.to[1]);
        notes.push(`${r.from} 为空，${r.to.join(' / ')} 无法派生（不伪造）`);
      }
    }
  }

  const schema = contract.v2Events.find((e) => e.name === name);
  if (!schema) {
    fatal.push(`事件「${name}」未登记在 v2 协议中`);
  }

  for (const r of enabled) {
    if (r.kind !== 'compat') continue;
    if (r.event !== '*' && r.event !== name) continue;
    if (!(r.field in fields) || fields[r.field] === undefined || fields[r.field] === null || fields[r.field] === '') {
      markMissing(r.field);
      notes.push(`兼容规则命中：${r.field} 缺失 —— ${r.note}`);
      if (r.required) fatal.push(`兼容必填字段 ${r.field} 缺失，契约禁止伪造`);
    }
  }

  if (schema) {
    for (const f of [...contract.commonRequired, ...schema.requiredFields]) {
      const v = fields[f];
      if (v === undefined || v === null || v === '') {
        markMissing(f);
        fatal.push(`必填字段 ${f} 缺失`);
      }
    }
  }

  return { sourceVersion: raw.version, name, timestamp: raw.timestamp, fields, missing, notes, fatal };
}
