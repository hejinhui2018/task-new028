// 协议契约校验：必填 / 类型 / 契约外字段（v2 严格阻断，v1 宽松告警）
import type { EventContract, ProtocolVersion } from './types';
import { findEventContract } from './migration';

export interface ValidationIssue {
  kind: 'MISSING_FIELD' | 'TYPE_MISMATCH' | 'STRICT_UNKNOWN_FIELD' | 'LENIENT_UNKNOWN_FIELD';
  field?: string;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  /** 阻断性问题（缺失 / 类型错误 / 严格模式多余字段） */
  blocking: ValidationIssue[];
  /** 非阻断告警（宽松模式多余字段） */
  warnings: ValidationIssue[];
}

export function validateProps(
  protocol: ProtocolVersion,
  eventName: string,
  props: Record<string, unknown>,
): ValidationResult {
  const contract: EventContract | undefined = findEventContract(protocol, eventName);
  const issues: ValidationIssue[] = [];
  if (!contract) {
    return { issues, blocking: [], warnings: [] };
  }

  for (const field of contract.required) {
    if (!Object.prototype.hasOwnProperty.call(props, field) || props[field] === undefined || props[field] === null) {
      issues.push({ kind: 'MISSING_FIELD', field, message: `缺少必填字段 ${field}` });
    }
  }

  if (contract.types) {
    for (const [field, expected] of Object.entries(contract.types)) {
      const value = props[field];
      if (value === undefined || value === null) continue;
      const actual = typeof value;
      const ok =
        expected === 'string' ? actual === 'string'
        : expected === 'number' ? actual === 'number'
        : expected === 'boolean' ? actual === 'boolean'
        : true;
      if (!ok) {
        issues.push({
          kind: 'TYPE_MISMATCH',
          field,
          message: `字段 ${field} 类型应为 ${expected}，实际为 ${actual}`,
        });
      }
    }
  }

  const known = new Set([...contract.required, ...contract.optional]);
  for (const field of Object.keys(props)) {
    if (!known.has(field)) {
      if (protocol.strict) {
        issues.push({
          kind: 'STRICT_UNKNOWN_FIELD',
          field,
          message: `v2 严格模式：契约外字段 ${field} 不允许出现`,
        });
      } else {
        issues.push({
          kind: 'LENIENT_UNKNOWN_FIELD',
          field,
          message: `v1 宽松模式：契约外字段 ${field} 已忽略（不升级为阻断）`,
        });
      }
    }
  }

  const blocking = issues.filter((i) => i.kind !== 'LENIENT_UNKNOWN_FIELD');
  const warnings = issues.filter((i) => i.kind === 'LENIENT_UNKNOWN_FIELD');
  return { issues, blocking, warnings };
}
