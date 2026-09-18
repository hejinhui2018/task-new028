// v1 → v2 旧版适配：按迁移契约做字段改名、拆分；v2 必填而 v1 未采集的字段
// 显式登记为缺口（gap），绝不伪造默认值。
import type {
  EventContract,
  EventMigration,
  FieldRule,
  FieldType,
  MigrationContract,
  ProtocolVersion,
  RawEvent,
} from './types';

export interface TransformNote {
  kind: 'rename' | 'split' | 'dropPii' | 'gap';
  message: string;
  /** gap 字段会导致 v2 必填校验失败 */
  field?: string;
}

export interface AdaptResult {
  /** 归一化后的 v2 事件名；找不到映射时为 null */
  name: string | null;
  props: Record<string, unknown>;
  notes: TransformNote[];
  /** 适配过程中实际使用的转换（写入 NormalizedEvent.transformedVia） */
  transformedVia: string[];
}

export function findProtocol(protocols: ProtocolVersion[], version: string): ProtocolVersion | undefined {
  return protocols.find((p) => p.version === String(version));
}

export function findEventContract(protocol: ProtocolVersion, name: string): EventContract | undefined {
  return protocol.events.find((e) => e.name === name);
}

function findMigration(migration: MigrationContract, v1EventName: string): EventMigration | undefined {
  return migration.events.find((m) => m.fromEvent === v1EventName);
}

export function getTypeGuard(types: Record<string, FieldType> | undefined, field: string) {
  const t = types?.[field];
  if (!t) return null;
  return (value: unknown): boolean => {
    if (t === 'string') return typeof value === 'string';
    if (t === 'number') return typeof value === 'number';
    if (t === 'boolean') return typeof value === 'boolean';
    return true;
  };
}

/**
 * 将 v1 事件适配为 v2 形态。
 * - rename：搬运字段值；
 * - split：按分隔符拆分到多个字段；
 * - dropPii：丢弃原文字段（隐私剥离应已先发生，这里是第二道闸）；
 * - gap：v2 必填且 v1 无来源 → 记录缺口，不填造任何值。
 */
export function adaptV1Event(
  ev: RawEvent,
  migration: MigrationContract,
): AdaptResult {
  const map = findMigration(migration, ev.name);
  if (!map) {
    return { name: null, props: { ...ev.props }, notes: [], transformedVia: [] };
  }

  const props: Record<string, unknown> = {};
  const notes: TransformNote[] = [];
  const transformedVia: string[] = [];

  for (const rule of map.fieldRules) {
    switch (rule.kind) {
      case 'rename': {
        if (Object.prototype.hasOwnProperty.call(ev.props, rule.from)) {
          props[rule.to] = ev.props[rule.from];
          notes.push({
            kind: 'rename',
            field: rule.to,
            message: `字段改名 ${rule.from} → ${rule.to}，归因关系已保留`,
          });
          transformedVia.push(`rename:${rule.from}>${rule.to}`);
        } else {
          notes.push({
            kind: 'gap',
            field: rule.to,
            message: `v1 未采集 ${rule.from}，无法改名得到 ${rule.to}（不伪造）`,
          });
          transformedVia.push(`gap:${rule.to}`);
        }
        break;
      }
      case 'split': {
        const raw = ev.props[rule.from];
        if (typeof raw === 'string' && raw.length > 0) {
          const parts = raw.split(rule.delimiter);
          for (const target of rule.to) {
            if (target.part >= 0 && target.part < parts.length) {
              props[target.field] = parts[target.part];
            } else {
              notes.push({
                kind: 'gap',
                field: target.field,
                message: `${rule.from} 拆分后不存在第 ${target.part + 1} 段，${target.field} 缺失（不伪造）`,
              });
              transformedVia.push(`gap:${target.field}`);
            }
          }
          notes.push({
            kind: 'split',
            message: `字段拆分 ${rule.from} → ${rule.to.map((t) => t.field).join('、')}`,
          });
          transformedVia.push(`split:${rule.from}`);
        } else {
          for (const target of rule.to) {
            notes.push({
              kind: 'gap',
              field: target.field,
              message: `v1 未提供可拆分的 ${rule.from}，${target.field} 缺失（不伪造）`,
            });
            transformedVia.push(`gap:${target.field}`);
          }
        }
        break;
      }
      case 'dropPii': {
        // 旧字段绝不能以任何形式残留到 v2 负载中
        notes.push({
          kind: 'dropPii',
          field: rule.from,
          message: `旧版 PII 字段 ${rule.from} 按规则丢弃，不做伪哈希`,
        });
        transformedVia.push(`dropPii:${rule.from}`);
        break;
      }
      case 'gap': {
        notes.push({
          kind: 'gap',
          field: rule.to,
          message: `v2 新字段 ${rule.to} 在 v1 无数据来源，保持缺失（不伪造）`,
        });
        transformedVia.push(`gap:${rule.to}`);
        break;
      }
    }
  }

  // 透传未被任何规则消费、且不与目标字段冲突的 v1 字段（宽松模式下给校验层告警）
  const consumedSources = new Set(
    map.fieldRules.flatMap((r: FieldRule) => (r.kind === 'rename' || r.kind === 'split' || r.kind === 'dropPii' ? [r.from] : [])),
  );
  for (const [key, value] of Object.entries(ev.props)) {
    if (!consumedSources.has(key) && !(key in props)) {
      props[key] = value;
    }
  }

  return { name: map.toEvent, props, notes, transformedVia };
}
