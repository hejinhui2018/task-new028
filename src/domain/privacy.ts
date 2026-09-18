// 隐私契约执行：整条禁采事件拦截 + 禁采字段剥离
import type { PrivacyContract, RawEvent } from './types';

export interface PrivacyResult {
  /** 整条事件被禁止采集 */
  eventDenied: boolean;
  /** 被剥离的字段名 */
  strippedFields: string[];
  /** 剥离后的 props（浅拷贝，绝不回写原事件） */
  cleanProps: Record<string, unknown>;
}

export function applyPrivacy(privacy: PrivacyContract, ev: RawEvent): PrivacyResult {
  const eventDenied = privacy.deniedEvents.includes(ev.name);
  const strippedFields: string[] = [];
  const cleanProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ev.props)) {
    if (privacy.deniedFields.includes(key)) {
      strippedFields.push(key);
      // 显式丢弃：不做哈希/掩码后继续上报，杜绝“换个名字流入下游”
      continue;
    }
    cleanProps[key] = value;
  }
  return { eventDenied, strippedFields, cleanProps };
}

/** 归一化事件是否含任何禁采字段（测试与 UI 自检共用） */
export function leaksPrivacy(privacy: PrivacyContract, props: Record<string, unknown>): string[] {
  return Object.keys(props).filter((k) => privacy.deniedFields.includes(k));
}
