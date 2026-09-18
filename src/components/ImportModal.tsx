import { useState } from 'react';
import { useStore } from '../state/store';
import { eventsToJson, parseEventsJson } from '../domain/importer';
import { DEMO_CASES } from '../data/cases';

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { state, setQueue } = useStore();
  const [text, setText] = useState(() => eventsToJson(state.queue));
  const report = parseEventsJson(text);
  const hasJsonError = report.errors.some((e) => e.startsWith('JSON 解析失败'));

  const apply = () => {
    if (report.events.length === 0) return;
    setQueue(report.events, 'custom');
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header>
          <h3>导入旧/新 SDK 混合事件</h3>
          <span className="muted small">支持单个事件对象或数组；可编辑后导入，全部本地解析</span>
        </header>
        <div className="modal-body">
          <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            {DEMO_CASES.slice(0, 3).map((c) => (
              <button
                key={c.id}
                className="sm"
                onClick={() => setText(eventsToJson(c.events))}
              >
                载入示例：{c.name}
              </button>
            ))}
          </div>
          <textarea
            style={{ width: '100%', height: 340 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          {hasJsonError && <div className="error-text">{report.errors[0]}</div>}
          {!hasJsonError && report.errors.length > 0 && (
            <div className="error-text">
              {report.errors.length} 条结构问题：
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {report.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {!hasJsonError && report.events.length > 0 && report.errors.length === 0 && (
            <div className="success-text">✓ 解析出 {report.events.length} 个事件，可导入</div>
          )}
        </div>
        <footer>
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={apply} disabled={report.events.length === 0 || report.errors.length > 0}>
            导入并重放
          </button>
        </footer>
      </div>
    </div>
  );
}
