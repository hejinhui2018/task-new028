import type { ContractRule, EventContract } from '../domain/types';

interface Props {
  contract: EventContract;
  onChange: (c: EventContract) => void;
}

let ruleSeq = 0;
function newId(prefix: string): string {
  ruleSeq += 1;
  return `${prefix}-custom-${ruleSeq}`;
}

/** 逗号分隔输入：失焦/回车时提交，避免受控输入吞掉逗号 */
function CsvInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string[];
  onCommit: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <input
      key={value.join(',')}
      className="text-input"
      defaultValue={value.join(', ')}
      placeholder={placeholder}
      onBlur={(e) =>
        onCommit(
          e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function ContractPanel({ contract, onChange }: Props) {
  const setRules = (rules: ContractRule[]) => onChange({ ...contract, rules });
  const upRule = (id: string, patch: Partial<ContractRule>) =>
    setRules(contract.rules.map((r) => (r.id === id ? ({ ...r, ...patch } as ContractRule) : r)));
  const delRule = (id: string) => setRules(contract.rules.filter((r) => r.id !== id));

  const maps = contract.rules.filter((r) => r.kind === 'event-map');
  const renames = contract.rules.filter((r) => r.kind === 'rename');
  const splits = contract.rules.filter((r) => r.kind === 'split');
  const compats = contract.rules.filter((r) => r.kind === 'compat');

  return (
    <div className="panel">
      <h2>迁移契约</h2>
      <p className="hint">规则改动会立即按新契约重放全部已到达事件。</p>

      <section>
        <div className="sec-head">
          <h3>事件映射（v1 → v2）</h3>
          <button
            className="mini"
            onClick={() =>
              setRules([...contract.rules, { id: newId('m'), kind: 'event-map', enabled: true, from: 'v1_event', to: 'v2_event' }])
            }
          >
            + 添加
          </button>
        </div>
        {maps.map(
          (r) =>
            r.kind === 'event-map' && (
              <div className={`rule ${r.enabled ? '' : 'off'}`} key={r.id}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => upRule(r.id, { enabled: e.target.checked })} />
                <input className="text-input" value={r.from} onChange={(e) => upRule(r.id, { from: e.target.value })} />
                <span className="arrow">→</span>
                <input className="text-input" value={r.to} onChange={(e) => upRule(r.id, { to: e.target.value })} />
                <button className="mini danger" title="删除规则" onClick={() => delRule(r.id)}>×</button>
              </div>
            ),
        )}
      </section>

      <section>
        <div className="sec-head">
          <h3>字段改名</h3>
          <button
            className="mini"
            onClick={() =>
              setRules([...contract.rules, { id: newId('r'), kind: 'rename', enabled: true, event: '*', from: 'old', to: 'new' }])
            }
          >
            + 添加
          </button>
        </div>
        {renames.map(
          (r) =>
            r.kind === 'rename' && (
              <div className={`rule ${r.enabled ? '' : 'off'}`} key={r.id}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => upRule(r.id, { enabled: e.target.checked })} />
                <input
                  className="text-input narrow"
                  title="作用事件（* 表示全部 v1 事件）"
                  value={r.event}
                  onChange={(e) => upRule(r.id, { event: e.target.value })}
                />
                <input className="text-input" value={r.from} onChange={(e) => upRule(r.id, { from: e.target.value })} />
                <span className="arrow">→</span>
                <input className="text-input" value={r.to} onChange={(e) => upRule(r.id, { to: e.target.value })} />
                <button className="mini danger" title="删除规则" onClick={() => delRule(r.id)}>×</button>
              </div>
            ),
        )}
      </section>

      <section>
        <div className="sec-head">
          <h3>字段拆分</h3>
          <button
            className="mini"
            onClick={() =>
              setRules([
                ...contract.rules,
                { id: newId('s'), kind: 'split', enabled: true, event: '*', from: 'full', to: ['part_a', 'part_b'], separator: '/' },
              ])
            }
          >
            + 添加
          </button>
        </div>
        {splits.map(
          (r) =>
            r.kind === 'split' && (
              <div className={`rule ${r.enabled ? '' : 'off'}`} key={r.id}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => upRule(r.id, { enabled: e.target.checked })} />
                <input
                  className="text-input narrow"
                  title="作用事件"
                  value={r.event}
                  onChange={(e) => upRule(r.id, { event: e.target.value })}
                />
                <input className="text-input" value={r.from} onChange={(e) => upRule(r.id, { from: e.target.value })} />
                <span className="arrow">按</span>
                <input
                  className="text-input tiny"
                  title="分隔符"
                  value={r.separator}
                  onChange={(e) => upRule(r.id, { separator: e.target.value })}
                />
                <span className="arrow">→</span>
                <input
                  className="text-input"
                  value={r.to[0]}
                  onChange={(e) => upRule(r.id, { to: [e.target.value, r.to[1]] })}
                />
                <input
                  className="text-input"
                  value={r.to[1]}
                  onChange={(e) => upRule(r.id, { to: [r.to[0], e.target.value] })}
                />
                <button className="mini danger" title="删除规则" onClick={() => delRule(r.id)}>×</button>
              </div>
            ),
        )}
      </section>

      <section>
        <div className="sec-head">
          <h3>兼容规则（缺失即记录，必填则失效）</h3>
          <button
            className="mini"
            onClick={() =>
              setRules([
                ...contract.rules,
                { id: newId('c'), kind: 'compat', enabled: true, event: '*', field: 'some_field', required: false, note: '说明' },
              ])
            }
          >
            + 添加
          </button>
        </div>
        {compats.map(
          (r) =>
            r.kind === 'compat' && (
              <div className={`rule compat ${r.enabled ? '' : 'off'}`} key={r.id}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => upRule(r.id, { enabled: e.target.checked })} />
                <input
                  className="text-input narrow"
                  title="作用事件（v2 名或 *）"
                  value={r.event}
                  onChange={(e) => upRule(r.id, { event: e.target.value })}
                />
                <input
                  className="text-input"
                  title="字段"
                  value={r.field}
                  onChange={(e) => upRule(r.id, { field: e.target.value })}
                />
                <label className="req" title="必填：缺失即失效（禁止伪造）">
                  <input type="checkbox" checked={r.required} onChange={(e) => upRule(r.id, { required: e.target.checked })} />
                  必填
                </label>
                <input
                  className="text-input wide"
                  title="说明"
                  value={r.note}
                  onChange={(e) => upRule(r.id, { note: e.target.value })}
                />
                <button className="mini danger" title="删除规则" onClick={() => delRule(r.id)}>×</button>
              </div>
            ),
        )}
      </section>

      <section>
        <h3>v2 必填字段</h3>
        <div className="kv">
          <span>公共必填</span>
          <CsvInput value={contract.commonRequired} onCommit={(v) => onChange({ ...contract, commonRequired: v })} />
        </div>
        {contract.v2Events.map((s, i) => (
          <div className="kv" key={s.name}>
            <span className="mono">{s.name}</span>
            <CsvInput
              value={s.requiredFields}
              onCommit={(v) =>
                onChange({
                  ...contract,
                  v2Events: contract.v2Events.map((x, j) => (j === i ? { ...x, requiredFields: v } : x)),
                })
              }
            />
          </div>
        ))}
      </section>

      <section>
        <h3>隐私禁采字段（命中即阻断）</h3>
        <CsvInput
          value={contract.forbiddenFields}
          placeholder="email, phone, ip …"
          onCommit={(v) => onChange({ ...contract, forbiddenFields: v })}
        />
      </section>

      <section>
        <h3>乱序容忍窗口</h3>
        <div className="kv">
          <input
            className="text-input tiny"
            type="number"
            value={contract.orderToleranceMs}
            onChange={(e) => onChange({ ...contract, orderToleranceMs: Number(e.target.value) || 0 })}
          />
          <span>ms（仅标注时间戳回拨，不改变到达顺序语义）</span>
        </div>
      </section>
    </div>
  );
}
