import { DEMO_CASES } from '../data/cases';
import { useStore } from '../state/store';

interface Props {
  onOpenImport: () => void;
  onOpenContract: () => void;
}

export function TopBar({ onOpenImport, onOpenContract }: Props) {
  const { state, loadCase } = useStore();
  const activeCase = DEMO_CASES.find((c) => c.id === state.caseId);

  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo">EC</div>
        <div>
          <h1>EventContract 埋点迁移验收台</h1>
          <div className="sub">v1 / v2 协议共存期 · 状态化旅程重放 · 全浏览器本地运行</div>
        </div>
      </div>
      <div className="spacer" />
      <select
        className="case-select"
        value={state.caseId}
        onChange={(e) => loadCase(e.target.value)}
        title="选择内置迁移案例"
      >
        {DEMO_CASES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        {!DEMO_CASES.some((c) => c.id === state.caseId) && <option value={state.caseId}>自定义队列</option>}
      </select>
      <button onClick={onOpenImport}>导入混合事件</button>
      <button onClick={onOpenContract}>协议与迁移规则</button>
    </div>
  );
}

export function CaseDescription() {
  const { state } = useStore();
  const activeCase = DEMO_CASES.find((c) => c.id === state.caseId);
  if (!activeCase) return null;
  return <div className="case-desc">📋 {activeCase.description}</div>;
}
