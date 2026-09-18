/**
 * 逐纬试织预演的状态机（纯函数，便于测试）。
 *
 * 关键约束：预演不缓存任何已织行的内容——已织部分每次都由
 * “当前最新组织图 + 已织行数 pick” 现算（见 wovenRows），
 * 因此编辑穿综/提综/踏纹后，从当前行继续播放也必然使用最新组织。
 */

export interface PreviewState {
  /** 已织行数（0..totalRows），即下一行要织的序号 */
  pick: number;
  /** 是否正在自动播放 */
  playing: boolean;
}

export function createPreview(): PreviewState {
  return { pick: 0, playing: false };
}

/** 前进一行；到达末行后自动停止 */
export function stepPreview(s: PreviewState, totalRows: number): PreviewState {
  if (s.pick >= totalRows) return { ...s, playing: false };
  const pick = s.pick + 1;
  return { pick, playing: pick < totalRows ? s.playing : false };
}

export function resetPreview(): PreviewState {
  return { pick: 0, playing: false };
}

/** 编辑后同步：总行数变化（如循环次数调整）时钳制当前行 */
export function syncPreview(s: PreviewState, totalRows: number): PreviewState {
  const pick = Math.min(s.pick, totalRows);
  return { pick, playing: s.playing && pick < totalRows };
}

/**
 * 已织部分：第 r 行在 r < pick 时取自（最新的）组织图，否则为 null（未织）。
 * 传入的 drawdown 永远是当前最新计算结果，因此编辑后无需任何失效处理。
 */
export function wovenRows(drawdown: boolean[][], pick: number): (boolean[] | null)[] {
  return drawdown.map((row, r) => (r < pick ? row : null));
}
