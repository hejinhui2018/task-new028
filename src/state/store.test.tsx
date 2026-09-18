import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { StoreProvider, useStore } from './store';
import { v1Trial, v2ProjectCreated, v1Publish, v2Exposure } from '../data/cases';

const wrapper = ({ children }: PropsWithChildren) => <StoreProvider>{children}</StoreProvider>;

describe('回放状态层', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('单步推进后结论来自执行器，且可撤销/重做', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    expect(result.current.steps).toHaveLength(0);

    act(() => result.current.step());
    expect(result.current.state.fedCount).toBe(1);
    expect(result.current.steps).toHaveLength(1);
    expect(result.current.steps[0].eventId).toBe('e-trial');
    expect(result.current.snapshot.stages.trial.reached).toBe(true);

    act(() => result.current.undo());
    expect(result.current.state.fedCount).toBe(0);
    expect(result.current.steps).toHaveLength(0);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.state.fedCount).toBe(1);
    expect(result.current.steps[0].eventId).toBe('e-trial');
  });

  it('替换队列（故障注入）后重放从头开始，且可撤销恢复', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => result.current.step());
    act(() => result.current.step());
    const injected = [v1Trial(), v2Exposure(), v2ProjectCreated(), v1Publish(), { ...v1Publish(), arrivalDelayMs: 500 }];
    act(() => result.current.setQueue(injected, 'custom'));
    expect(result.current.state.fedCount).toBe(0);
    expect(result.current.state.caseId).toBe('custom');

    act(() => result.current.undo());
    expect(result.current.state.caseId).toBe(result.current.state.caseId);
    expect(result.current.state.fedCount).toBe(2);
  });

  it('拖动进度条跳转到任意已到达点，结论随之重算', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => result.current.seek(3));
    expect(result.current.state.fedCount).toBe(3);
    expect(result.current.snapshot.stages.project.reached).toBe(true);
    expect(result.current.snapshot.stages.publish.reached).toBe(false);
    act(() => result.current.seek(4));
    expect(result.current.snapshot.stages.publish.reached).toBe(true);
  });

  it('状态持久化到 localStorage：刷新恢复后队列与进度保留但不自动播放', () => {
    const { result, unmount } = renderHook(() => useStore(), { wrapper });
    act(() => result.current.step());
    act(() => result.current.step());
    unmount();

    const raw = JSON.parse(localStorage.getItem('eventcontract-console-v1')!);
    expect(raw.queue.length).toBeGreaterThan(0);
    expect(raw.fedCount).toBe(2);
    expect(raw.playing).toBe(false);

    const restored = renderHook(() => useStore(), { wrapper });
    expect(restored.result.current.state.fedCount).toBe(2);
    expect(restored.result.current.state.playing).toBe(false);
    expect(restored.result.current.steps).toHaveLength(2);
  });

  it('重复重放：同一队列重置后再走一遍，结论一致', () => {
    const { result } = renderHook(() => useStore(), { wrapper });
    act(() => result.current.seek(4));
    const firstRun = JSON.stringify({
      steps: result.current.steps,
      snapshot: result.current.snapshot,
    });
    act(() => result.current.reset());
    expect(result.current.state.fedCount).toBe(0);
    act(() => result.current.seek(4));
    const secondRun = JSON.stringify({
      steps: result.current.steps,
      snapshot: result.current.snapshot,
    });
    expect(secondRun).toBe(firstRun);
  });
});
