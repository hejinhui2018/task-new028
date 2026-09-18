import { describe, expect, it } from 'vitest';
import { parseEventsJson } from './importer';

describe('混合事件导入', () => {
  it('解析数组形态', () => {
    const text = JSON.stringify([
      { id: 'a', schemaVersion: '1', name: 'trial_started', ts: 1, source: 'v1-sdk', props: { plan: 'pro' } },
      { id: 'b', schemaVersion: 2, name: 'project_created', props: { project_name: 'x' } },
    ]);
    const report = parseEventsJson(text);
    expect(report.errors).toEqual([]);
    expect(report.events).toHaveLength(2);
    expect(report.events[1].schemaVersion).toBe('2');
    expect(report.events[1].source).toBe('v2-sdk');
  });

  it('单对象也接受，缺字段给出定位错误', () => {
    const report = parseEventsJson('{"id":"x","props":{}}');
    expect(report.events).toHaveLength(0);
    expect(report.errors.join(' ')).toMatch(/schemaVersion/);
    expect(report.errors.join(' ')).toMatch(/name/);
  });

  it('JSON 语法错误时返回错误而非抛异常', () => {
    const report = parseEventsJson('{not json');
    expect(report.events).toEqual([]);
    expect(report.errors[0]).toMatch(/JSON 解析失败/);
  });

  it('非对象 props 回退为空对象', () => {
    const report = parseEventsJson('{"id":"x","schemaVersion":"2","name":"ping","props":[]}');
    expect(report.events[0].props).toEqual({});
  });
});
