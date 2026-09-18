import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StoreProvider } from './state/store';
import { App } from './App';

function renderApp() {
  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  );
}

const step = () => fireEvent.click(screen.getByTitle('喂入下一个到达事件（空格/回车）'));
const undo = () => fireEvent.click(screen.getByTitle('撤销（Ctrl/Cmd+Z）'));
const redo = () =>
  fireEvent.click(screen.getByTitle('重做（Ctrl/Cmd+Y）'));

describe('App 冒烟', () => {
  beforeEach(() => localStorage.clear());

  it('初始渲染：案例、空判定日志、旅程轨道都在', () => {
    renderApp();
    expect(screen.getByText(/EventContract 埋点迁移验收台/)).toBeInTheDocument();
    expect(screen.getByText(/还没有事件到达/)).toBeInTheDocument();
    expect(screen.getByText('开通试用')).toBeInTheDocument();
    expect(screen.getByText('创建项目')).toBeInTheDocument();
    expect(screen.getByText('首次发布')).toBeInTheDocument();
  });

  it('单步三次后出现接受判定，再一步发布出现转化结论', () => {
    renderApp();
    step();
    step();
    step();
    const log = screen.getByText(/状态化判定日志/).closest('.panel') as HTMLElement;
    expect(within(log).getAllByText('接受').length).toBeGreaterThan(0);
    step();
    // 链路面板出现已归因的发布结论
    expect(screen.getByText(/首次发布已归因/)).toBeInTheDocument();
  });

  it('撤销后回到上一步，可重做恢复', () => {
    renderApp();
    step();
    undo();
    expect(screen.getByText(/还没有事件到达/)).toBeInTheDocument();
    redo();
    expect(screen.queryByText(/还没有事件到达/)).not.toBeInTheDocument();
  });
});
