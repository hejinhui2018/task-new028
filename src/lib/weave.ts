/**
 * 织物组织核心计算：组织矩阵、循环展开、浮线检测。
 *
 * 关系链：穿综 threading + 提综 tieUp + 踏纹 treadling → 组织图 drawdown。
 * 任意一处修改都通过重新调用 computeDrawdown 沿完整关系重算。
 */

/** 织物结构三元组 */
export interface WeaveStructure {
  /** threading[warp] = 该经纱穿入的综框（0-based） */
  threading: number[];
  /** tieUp[harness][treadle] = 踩下踏板 treadle 时综框 harness 是否提升 */
  tieUp: boolean[][];
  /** treadling[pick] = 该行纬纱踩下的踏板（0-based） */
  treadling: number[];
}

/**
 * 组织图（交织矩阵）：drawdown[pick][warp]。
 * true = 经组织点（经纱在纬纱之上），false = 纬组织点（纬纱在上）。
 * 关系式：drawdown[y][x] = tieUp[threading[x]][treadling[y]]
 */
export function computeDrawdown(s: WeaveStructure): boolean[][] {
  return s.treadling.map((treadle) =>
    s.threading.map((harness) => Boolean(s.tieUp[harness]?.[treadle])),
  );
}

/** 序列循环展开：[a, b] ×3 → [a, b, a, b, a, b] */
export function expandSequence<T>(seq: readonly T[], times: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(1, Math.floor(times)); i++) out.push(...seq);
  return out;
}

/** 组织图按循环次数平铺展开（expanded[y][x] = base[y % H][x % W]） */
export function expandDrawdown(base: boolean[][], repeatX: number, repeatY: number): boolean[][] {
  const h = base.length;
  const w = h > 0 ? base[0].length : 0;
  const rx = Math.max(1, Math.floor(repeatX));
  const ry = Math.max(1, Math.floor(repeatY));
  const out: boolean[][] = [];
  for (let y = 0; y < h * ry; y++) {
    const src = base[y % h];
    const row = new Array<boolean>(w * rx);
    for (let x = 0; x < w * rx; x++) row[x] = src[x % w];
    out.push(row);
  }
  return out;
}

/** 浮线方向：warp = 经向（同一根经纱连续浮过），weft = 纬向（同一根纬纱连续浮过） */
export type FloatDirection = 'warp' | 'weft';
/** 浮线所在面：face = 正面，back = 背面 */
export type FloatSide = 'face' | 'back';

/** 一条超限浮线 */
export interface FloatRun {
  direction: FloatDirection;
  side: FloatSide;
  /** 起始行（纬纱序号，基于传入的组织图坐标） */
  row: number;
  /** 起始列（经纱序号，基于传入的组织图坐标） */
  col: number;
  /** 连续长度（格数） */
  length: number;
  /** 是否跨越循环边界（仅循环检测时出现） */
  wraps: boolean;
}

export interface DetectFloatsOptions {
  /** 横向按循环连续处理（右边界与左边界相接） */
  wrapX?: boolean;
  /** 纵向按循环连续处理（下边界与上边界相接） */
  wrapY?: boolean;
}

interface RawRun {
  start: number;
  length: number;
  value: boolean;
  wraps: boolean;
}

/** 线性最大同值游程 */
function linearRuns(line: readonly boolean[]): RawRun[] {
  const runs: RawRun[] = [];
  let i = 0;
  while (i < line.length) {
    let j = i + 1;
    while (j < line.length && line[j] === line[i]) j++;
    runs.push({ start: i, length: j - i, value: line[i], wraps: false });
    i = j;
  }
  return runs;
}

/** 环形最大同值游程（首尾相接；跨接缝的游程合并并标记 wraps） */
function circularRuns(line: readonly boolean[]): RawRun[] {
  const n = line.length;
  if (n === 0) return [];
  // 找一个“断点”作为扫描起点，保证接缝两侧的游程被合并为一条
  let breakIdx = -1;
  for (let i = 0; i < n; i++) {
    if (line[i] !== line[(i + n - 1) % n]) {
      breakIdx = i;
      break;
    }
  }
  if (breakIdx === -1) {
    // 整圈同值：浮线无限延续，按整圈长度上报
    return [{ start: 0, length: n, value: line[0], wraps: true }];
  }
  const runs: RawRun[] = [];
  let start = breakIdx;
  let length = 1;
  for (let k = 1; k < n; k++) {
    const idx = (breakIdx + k) % n;
    if (line[idx] === line[start]) {
      length++;
    } else {
      runs.push({ start, length, value: line[start], wraps: start + length > n });
      start = idx;
      length = 1;
    }
  }
  runs.push({ start, length, value: line[start], wraps: start + length > n });
  return runs;
}

/**
 * 浮线检测：
 * - 经向浮线 = 组织图某一列中的连续同值段（true → 经纱浮于正面，false → 浮于背面）；
 * - 纬向浮线 = 某一行中的连续同值段（false → 纬纱浮于正面，true → 浮于背面）。
 * 只上报长度超过 maxFloat 的段。
 */
export function detectFloats(
  drawdown: boolean[][],
  maxFloat: number,
  opts: DetectFloatsOptions = {},
): FloatRun[] {
  const h = drawdown.length;
  const w = h > 0 ? drawdown[0].length : 0;
  const issues: FloatRun[] = [];

  for (let y = 0; y < h; y++) {
    const runs = opts.wrapX ? circularRuns(drawdown[y]) : linearRuns(drawdown[y]);
    for (const r of runs) {
      if (r.length > maxFloat) {
        issues.push({
          direction: 'weft',
          side: r.value ? 'back' : 'face',
          row: y,
          col: r.start,
          length: r.length,
          wraps: r.wraps,
        });
      }
    }
  }

  for (let x = 0; x < w; x++) {
    const col = new Array<boolean>(h);
    for (let y = 0; y < h; y++) col[y] = drawdown[y][x];
    const runs = opts.wrapY ? circularRuns(col) : linearRuns(col);
    for (const r of runs) {
      if (r.length > maxFloat) {
        issues.push({
          direction: 'warp',
          side: r.value ? 'face' : 'back',
          row: r.start,
          col: x,
          length: r.length,
          wraps: r.wraps,
        });
      }
    }
  }

  return issues.sort(
    (a, b) => a.row - b.row || a.col - b.col || (a.direction === b.direction ? 0 : a.direction === 'warp' ? -1 : 1),
  );
}

/** 浮线覆盖的格子（跨循环边界时按取模回绕） */
export function runCells(run: FloatRun, width: number, height: number): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let i = 0; i < run.length; i++) {
    if (run.direction === 'warp') {
      cells.push({ row: (run.row + i) % height, col: run.col });
    } else {
      cells.push({ row: run.row, col: (run.col + i) % width });
    }
  }
  return cells;
}

/** 绘制用矩形段 */
export interface Segment {
  row: number;
  col: number;
  rows: number;
  cols: number;
}

/** 把一条浮线拆成可绘制的矩形段（跨边界时拆成两段） */
export function runSegments(run: FloatRun, width: number, height: number): Segment[] {
  const segs: Segment[] = [];
  if (run.direction === 'warp') {
    let remaining = run.length;
    let r = run.row;
    while (remaining > 0) {
      const len = Math.min(remaining, height - r);
      segs.push({ row: r, col: run.col, rows: len, cols: 1 });
      remaining -= len;
      r = 0;
    }
  } else {
    let remaining = run.length;
    let c = run.col;
    while (remaining > 0) {
      const len = Math.min(remaining, width - c);
      segs.push({ row: run.row, col: c, rows: 1, cols: len });
      remaining -= len;
      c = 0;
    }
  }
  return segs;
}
