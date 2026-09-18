import { useEffect, useMemo, useReducer, useState } from 'react';
import { computeDrawdown, detectFloats, expandDrawdown } from './lib/weave';
import type { FloatRun } from './lib/weave';
import { createSampleProject } from './lib/sample';
import { loadProject, saveProject } from './lib/storage';
import { projectReducer } from './state/project';
import { ThreadingGrid } from './components/ThreadingGrid';
import { TieUpGrid } from './components/TieUpGrid';
import { TreadlingGrid } from './components/TreadlingGrid';
import { DrawdownCanvas } from './components/DrawdownCanvas';
import { IssuesPanel } from './components/IssuesPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PreviewPlayer } from './components/PreviewPlayer';

export default function App() {
  // 启动时从浏览器本地存储恢复；无存档则用内置破斜纹样稿
  const [project, dispatch] = useReducer(projectReducer, null, () => loadProject() ?? createSampleProject());
  const [selected, setSelected] = useState<FloatRun | null>(null);

  // 任何修改都写回本地存储
  useEffect(() => {
    saveProject(project);
  }, [project]);

  // 编辑后清除浮线选中态（坐标已变化）
  useEffect(() => {
    setSelected(null);
  }, [project]);

  const warpCount = project.threading.length;
  const weftCount = project.treadling.length;

  // 完整关系链：穿综 + 提综 + 踏纹 → 组织图 → 循环展开 → 浮线检测
  const baseDrawdown = useMemo(() => computeDrawdown(project), [project]);
  const drawdown = useMemo(
    () => expandDrawdown(baseDrawdown, project.repeatX, project.repeatY),
    [baseDrawdown, project.repeatX, project.repeatY],
  );
  const issues = useMemo(
    () => detectFloats(drawdown, project.maxFloat, { wrapX: true, wrapY: true }),
    [drawdown, project.maxFloat],
  );

  // 点击浮线问题 → 定位相关穿综列 / 踏纹行
  const highlightWarp = selected && selected.direction === 'warp' ? selected.col % warpCount : null;
  const highlightWeft = selected && selected.direction === 'weft' ? selected.row % weftCount : null;

  const restoreSample = () => {
    if (window.confirm('放弃当前全部修改，恢复内置破斜纹样稿？')) {
      dispatch({ type: 'restore', project: createSampleProject() });
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>织物组织设计台</h1>
        <p className="subtitle">{project.name} · 穿综 / 提综 / 踏纹任意修改，组织图与试织实时联动</p>
        <button type="button" className="btn" onClick={restoreSample}>
          恢复内置样稿
        </button>
      </header>

      <div className="layout">
        <section className="draft-area">
          <div className="quadrant q-threading">
            <h2>
              穿综图
              <span>
                {warpCount} 经 × {project.harnessCount} 综 · 点击格子穿入
              </span>
            </h2>
            <ThreadingGrid
              threading={project.threading}
              harnessCount={project.harnessCount}
              highlightWarp={highlightWarp}
              onSet={(warp, harness) => dispatch({ type: 'set-threading', warp, harness })}
            />
          </div>

          <div className="quadrant q-tieup">
            <h2>
              提综图
              <span>
                {project.harnessCount} 综 × {project.treadleCount} 踏 · 点击切换连接
              </span>
            </h2>
            <TieUpGrid
              tieUp={project.tieUp}
              treadleCount={project.treadleCount}
              onToggle={(harness, treadle) => dispatch({ type: 'toggle-tieup', harness, treadle })}
            />
          </div>

          <div className="quadrant q-drawdown">
            <h2>
              组织图
              <span>
                展开 {drawdown[0]?.length ?? 0} 经 × {drawdown.length} 纬（{project.repeatX} × {project.repeatY} 循环）·
                自动计算
              </span>
            </h2>
            <div className="canvas-scroll">
              <DrawdownCanvas
                drawdown={drawdown}
                warpColor={project.warpColor}
                weftColor={project.weftColor}
                issues={issues}
                selected={selected}
                onSelect={setSelected}
                baseCols={warpCount}
                baseRows={weftCount}
              />
            </div>
            <div className="legend">
              <span>
                <i className="swatch" style={{ background: project.warpColor }} />
                经组织点（经纱在上）
              </span>
              <span>
                <i className="swatch" style={{ background: project.weftColor }} />
                纬组织点（纬纱在上）
              </span>
              <span>
                <i className="swatch swatch-issue" />
                超限浮线（框内数字为长度）
              </span>
            </div>
          </div>

          <div className="quadrant q-treadling">
            <h2>
              踏纹图
              <span>
                {weftCount} 纬 × {project.treadleCount} 踏 · 点击选择踏板
              </span>
            </h2>
            <TreadlingGrid
              treadling={project.treadling}
              treadleCount={project.treadleCount}
              highlightWeft={highlightWeft}
              onSet={(pick, treadle) => dispatch({ type: 'set-treadling', pick, treadle })}
            />
          </div>
        </section>

        <aside className="sidebar">
          <SettingsPanel project={project} dispatch={dispatch} />
          <IssuesPanel
            issues={issues}
            maxFloat={project.maxFloat}
            warpCount={warpCount}
            weftCount={weftCount}
            selected={selected}
            onSelect={setSelected}
          />
        </aside>
      </div>

      <section className="preview-section">
        <h2>
          逐纬试织预演
          <span className="panel-sub">按踏纹顺序逐行上机；编辑后从当前行继续也使用最新组织</span>
        </h2>
        <PreviewPlayer
          drawdown={drawdown}
          treadling={project.treadling}
          warpColor={project.warpColor}
          weftColor={project.weftColor}
          baseRows={weftCount}
        />
      </section>
    </div>
  );
}
