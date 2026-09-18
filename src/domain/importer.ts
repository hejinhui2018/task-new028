// 导入旧/新 SDK 混合事件：宽松解析 + 结构校验，返回事件或带错误位置的报告
import type { RawEvent } from './types';

export interface ImportReport {
  events: RawEvent[];
  errors: string[];
}

/** 接受单个事件对象或事件数组的 JSON 文本 */
export function parseEventsJson(text: string): ImportReport {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { events: [], errors: [`JSON 解析失败：${(e as Error).message}`] };
  }

  const arr = Array.isArray(data) ? data : [data];
  const events: RawEvent[] = [];

  arr.forEach((item, i) => {
    const where = `第 ${i + 1} 条`;
    if (typeof item !== 'object' || item === null) {
      errors.push(`${where}：不是对象`);
      return;
    }
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : undefined;
    const schemaVersion = obj.schemaVersion !== undefined ? String(obj.schemaVersion) : undefined;
    const name = typeof obj.name === 'string' ? obj.name : undefined;
    const ts = typeof obj.ts === 'number' ? obj.ts : Date.now();
    const source =
      obj.source === 'v2-sdk' || obj.source === 'v1-sdk'
        ? obj.source
        : schemaVersion === '2'
          ? 'v2-sdk'
          : 'v1-sdk';

    if (!id) errors.push(`${where}：缺少字符串字段 id`);
    if (!schemaVersion) errors.push(`${where}：缺少 schemaVersion`);
    if (!name) errors.push(`${where}：缺少字符串字段 name`);
    if (!id || !schemaVersion || !name) return;

    const props =
      typeof obj.props === 'object' && obj.props !== null && !Array.isArray(obj.props)
        ? (obj.props as Record<string, unknown>)
        : {};

    events.push({
      id,
      schemaVersion,
      name,
      ts,
      source: source as RawEvent['source'],
      distinctId: typeof obj.distinctId === 'string' ? obj.distinctId : undefined,
      sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
      seq: typeof obj.seq === 'number' ? obj.seq : undefined,
      arrivalDelayMs: typeof obj.arrivalDelayMs === 'number' ? obj.arrivalDelayMs : 200,
      props,
    });
  });

  return { events, errors };
}

/** 把事件数组序列化回可编辑文本 */
export function eventsToJson(events: RawEvent[]): string {
  return JSON.stringify(events, null, 2);
}
