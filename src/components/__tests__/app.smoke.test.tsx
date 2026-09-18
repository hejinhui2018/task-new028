import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '../../App';

describe('App 冒烟', () => {
  it('首屏渲染不崩溃，包含关键面板与场景', () => {
    const html = renderToString(createElement(App));
    for (const text of ['EventContract 埋点迁移验收台', '迁移契约', '旅程重放', '到达队列', '影响台账', '处理日志', '基线']) {
      expect(html).toContain(text);
    }
  });
});
