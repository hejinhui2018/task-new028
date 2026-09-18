/** 一份织物样稿（设计文件）的完整数据模型 */
export interface WeaveProject {
  /** 样稿名称 */
  name: string;
  /** 综框数量 */
  harnessCount: number;
  /** 踏板数量 */
  treadleCount: number;
  /** 穿综：threading[warp] = 第 warp 根经纱穿入的综框（0-based） */
  threading: number[];
  /** 提综（综框 × 踏板连接矩阵）：tieUp[harness][treadle] = 踩下该踏板时该综框是否提升 */
  tieUp: boolean[][];
  /** 踏纹：treadling[pick] = 第 pick 行纬纱踩下的踏板（0-based） */
  treadling: number[];
  /** 经纱颜色（CSS 颜色值） */
  warpColor: string;
  /** 纬纱颜色（CSS 颜色值） */
  weftColor: string;
  /** 组织图横向循环次数 */
  repeatX: number;
  /** 组织图纵向循环次数 */
  repeatY: number;
  /** 允许的最大浮线长度（格数），超过即在组织图中标出 */
  maxFloat: number;
}
