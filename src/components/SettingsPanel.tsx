import type { Dispatch } from 'react';
import type { WeaveProject } from '../types';
import type { ProjectAction } from '../state/project';
import { FLOAT_MAX, FLOAT_MIN, REPEAT_MAX, REPEAT_MIN } from '../state/project';

interface SettingsPanelProps {
  project: WeaveProject;
  dispatch: Dispatch<ProjectAction>;
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      <span className="unit">{unit}</span>
    </div>
  );
}

/** 参数设置：经纬纱颜色、循环区间、最大浮线长度 */
export function SettingsPanel({ project, dispatch }: SettingsPanelProps) {
  return (
    <section className="panel">
      <h2>参数设置</h2>
      <div className="field">
        <label htmlFor="warp-color">经纱颜色</label>
        <input
          id="warp-color"
          type="color"
          value={project.warpColor}
          onChange={(e) => dispatch({ type: 'set-warp-color', color: e.target.value })}
        />
        <span className="unit">{project.warpColor}</span>
      </div>
      <div className="field">
        <label htmlFor="weft-color">纬纱颜色</label>
        <input
          id="weft-color"
          type="color"
          value={project.weftColor}
          onChange={(e) => dispatch({ type: 'set-weft-color', color: e.target.value })}
        />
        <span className="unit">{project.weftColor}</span>
      </div>
      <NumberField
        id="repeat-x"
        label="横向循环"
        value={project.repeatX}
        min={REPEAT_MIN}
        max={REPEAT_MAX}
        unit="次"
        onChange={(v) => dispatch({ type: 'set-repeat-x', value: v })}
      />
      <NumberField
        id="repeat-y"
        label="纵向循环"
        value={project.repeatY}
        min={REPEAT_MIN}
        max={REPEAT_MAX}
        unit="次"
        onChange={(v) => dispatch({ type: 'set-repeat-y', value: v })}
      />
      <NumberField
        id="max-float"
        label="最大浮线"
        value={project.maxFloat}
        min={FLOAT_MIN}
        max={FLOAT_MAX}
        unit="格"
        onChange={(v) => dispatch({ type: 'set-max-float', value: v })}
      />
      <p className="hint">循环次数用于组织图展开与试织；浮线检测按循环连续（跨边界合并）进行。</p>
    </section>
  );
}
