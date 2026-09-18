// 故障注入：全部为纯函数，输入事件数组、输出新数组（不修改入参）
import type { InjectedFault, RawEvent } from './types';

function clone(ev: RawEvent): RawEvent {
  return { ...structuredCloneSafe(ev), props: { ...ev.props }, faults: ev.faults ? [...ev.faults] : [] };
}

function tag(ev: RawEvent, fault: InjectedFault): RawEvent {
  const faults = new Set(ev.faults ?? []);
  faults.add(fault);
  return { ...ev, faults: [...faults] };
}

/** 为指定索引的事件追加同 ID 的重试副本（幂等去重测试） */
export function injectDuplicates(events: RawEvent[], atIndices?: number[], delayMs = 600): RawEvent[] {
  const targets = atIndices ?? events.map((_, i) => i);
  const out = [...events];
  const additions: { at: number; ev: RawEvent }[] = [];
  for (const i of targets) {
    const original = events[i];
    if (!original) continue;
    const dup = tag({ ...clone(original), arrivalDelayMs: delayMs }, 'duplicate');
    additions.push({ at: i + 1, ev: dup });
  }
  // 从后往前插入，避免索引位移
  additions.sort((a, b) => b.at - a.at);
  for (const { at, ev } of additions) out.splice(at, 0, ev);
  return out;
}

/** 把指定事件设置为迟到（加大到达间隔） */
export function injectLate(events: RawEvent[], indices: number[], delayMs = 6000): RawEvent[] {
  return events.map((ev, i) =>
    indices.includes(i) ? tag({ ...clone(ev), arrivalDelayMs: delayMs }, 'late') : clone(ev),
  );
}

/** 给指定事件注入禁采字段（字段级隐私测试） */
export function injectPiiField(events: RawEvent[], indices: number[]): RawEvent[] {
  return events.map((ev, i) => {
    if (!indices.includes(i)) return clone(ev);
    const next = clone(ev);
    next.props = {
      ...next.props,
      phone: '13800001111',
      email: 'tester@example.com',
    };
    return tag(next, 'pii');
  });
}

/** 跨会话：复制指定事件并换成另一个 sessionId（会话关联破裂测试） */
export function injectCrossSession(events: RawEvent[], indices: number[]): RawEvent[] {
  const out = [...events];
  const additions: { at: number; ev: RawEvent }[] = [];
  for (const i of indices) {
    const original = events[i];
    if (!original) continue;
    const crossed = tag(
      {
        ...clone(original),
        id: `${original.id}-xs`,
        sessionId: 's-strange-9999',
        arrivalDelayMs: 400,
      },
      'cross-session',
    );
    additions.push({ at: i + 1, ev: crossed });
  }
  additions.sort((a, b) => b.at - a.at);
  for (const { at, ev } of additions) out.splice(at, 0, ev);
  return out;
}

/** 确定性伪随机（默认），也可传入 Math.random 供界面“随机洗牌” */
export function shuffleArrivals(
  events: RawEvent[],
  rng: () => number = mulberry32(20260918),
): RawEvent[] {
  const tagged = events.map((ev) => tag(clone(ev), 'reordered'));
  for (let i = tagged.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  return tagged;
}

export function reverseArrivals(events: RawEvent[]): RawEvent[] {
  return [...events].reverse().map((ev) => tag(clone(ev), 'reordered'));
}

export function moveItem(events: RawEvent[], from: number, to: number): RawEvent[] {
  if (from < 0 || from >= events.length || to < 0 || to >= events.length || from === to) {
    return events.map(clone);
  }
  const out = events.map(clone);
  const [item] = out.splice(from, 1);
  out.splice(to, 0, tag(item, 'reordered'));
  return out;
}

/** 让旅程阶段事件倒序（发布→创建→试用），其余事件保持原位 */
export function reverseJourneyOrder(events: RawEvent[], journeyEventNames: string[]): RawEvent[] {
  const indexed = events
    .map((ev, i) => ({ ev, i }))
    .filter(({ ev }) => journeyEventNames.includes(ev.name));
  const namesDesc = indexed.map(({ ev }) => tag(clone(ev), 'reordered'));
  const out = events.map(clone);
  indexed.forEach((slot, k) => {
    out[slot.i] = namesDesc[indexed.length - 1 - k];
  });
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
