import { cellsToGrid } from "../snk/cellsToGrid";
import { getBestRoute } from "../snk/solver-getBestRoute";
import { createSvg } from "../snk/svg-index";
import { snake4 } from "../snk/fixtures-snake";
import type { Grid } from "../snk/types-grid";
import type { Snake } from "../snk/types-snake";
import type { SnakeCell } from "../data/worklog-parser";

const MOONLIT_DRAW_OPTIONS = {
  colorDots: { 1: "#C4A882", 2: "#A8845A", 3: "#B5392A", 4: "#8B1A0A" } as Record<1|2|3|4, string>,
  colorEmpty: "#E4D8C8",
  colorDotBorder: "transparent",
  colorSnake: "#B5392A",
  sizeCell: 14,
  sizeDot: 10,
  sizeDotBorderRadius: 2,
};

const MONTHS   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LBLS = ["Mon","","Wed","","Fri","","Sun"];

/** 緩存的計算結果（grid + chain），不緩存 SVG 字符串 */
export interface SnakeRouteCache {
  grid: Grid;
  chain: Snake[];
  cellsKey: string;  // 用來判斷活動數據是否變化
}

function cellsKey(cells: SnakeCell[]): string {
  return cells.length + ":" + cells.reduce((s, c) => s + c.level, 0);
}

function getStartDate(): Date {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(today); d.setDate(today.getDate() - 364);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 1 ? 0 : dow === 0 ? 6 : dow - 1));
  return d;
}

function addDateLabels(svgEl: SVGElement): void {
  const sz = MOONLIT_DRAW_OPTIONS.sizeCell;
  const ns = "http://www.w3.org/2000/svg";
  const fill = "#8A7968", font = '"JetBrains Mono","Fira Code",monospace';

  const vbStr = svgEl.getAttribute("viewBox") || "-14 -28 770 168";
  const vb = vbStr.split(/\s+/).map(Number) as [number,number,number,number];
  const EL = 30, EB = 18;
  svgEl.setAttribute("viewBox", `${vb[0]-EL} ${vb[1]} ${vb[2]+EL} ${vb[3]+EB}`);
  svgEl.setAttribute("height", String(parseInt(svgEl.getAttribute("height")||"168") + EB));

  for (let d = 0; d < 7; d++) {
    if (!DAY_LBLS[d]) continue;
    const t = document.createElementNS(ns, "text") as SVGTextElement;
    t.setAttribute("x", String(vb[0] - 4));
    t.setAttribute("y", String(d * sz + sz/2 + 3));
    t.setAttribute("text-anchor","end"); t.setAttribute("dominant-baseline","middle");
    t.setAttribute("font-size","9"); t.setAttribute("fill",fill); t.setAttribute("font-family",font);
    t.textContent = DAY_LBLS[d]; svgEl.appendChild(t);
  }

  const startDate = getStartDate();
  let lastMonth = -1;
  for (let w = 0; w < 53; w++) {
    const date = new Date(startDate); date.setDate(startDate.getDate() + w * 7);
    const month = date.getMonth();
    if (month !== lastMonth) {
      const t = document.createElementNS(ns, "text") as SVGTextElement;
      t.setAttribute("x", String(w * sz + 1));
      t.setAttribute("y", String(7 * sz + 12));
      t.setAttribute("text-anchor","start"); t.setAttribute("font-size","9");
      t.setAttribute("fill",fill); t.setAttribute("font-family",font);
      t.textContent = MONTHS[month]; svgEl.appendChild(t);
      lastMonth = month;
    }
  }
}

/**
 * 渲染貪吃蛇熱力圖。
 *
 * 緩存策略：緩存 getBestRoute 的計算結果（grid + chain），而非 SVG 字符串。
 * 每次重新調用都生成新的 SVG 字符串，確保 CSS animation 必然重新播放。
 * 只有 cells 數據變化時才重新跑 getBestRoute（耗時操作）。
 */
export async function renderSnakeHeatmap(
  container: HTMLElement,
  cells: SnakeCell[],
  routeCache?: SnakeRouteCache,
): Promise<SnakeRouteCache | null> {
  container.empty();

  if (cells.length === 0) {
    container.createDiv({ cls: "ts-snake-empty", text: "No activity data found" });
    return null;
  }

  const key = cellsKey(cells);
  let grid: Grid;
  let chain: Snake[];

  if (routeCache && routeCache.cellsKey === key) {
    // 複用已計算的路徑，跳過耗時的 getBestRoute
    grid  = routeCache.grid;
    chain = routeCache.chain;
  } else {
    // 首次或數據有變化：重新計算
    const loading = container.createDiv({ cls: "ts-snake-loading", text: "Computing snake path…" });
    try {
      grid  = cellsToGrid(cells);
      chain = getBestRoute(grid, snake4);
      loading.remove();
    } catch (err) {
      loading.remove();
      container.createDiv({ cls: "ts-snake-error", text: `Snake failed: ${err}` });
      return null;
    }
  }

  // 每次都重新生成 SVG 字符串 → CSS animation 從頭開始播放
  try {
    const svg = createSvg(grid, null, chain, MOONLIT_DRAW_OPTIONS, { stepDurationMs: 80 });
    const wrapper = container.createDiv({ cls: "ts-snake-wrapper" });
    wrapper.innerHTML = svg;
    const svgEl = wrapper.querySelector("svg") as SVGElement | null;
    if (svgEl) {
      addDateLabels(svgEl);
      svgEl.setAttribute("width","100%"); svgEl.style.maxWidth = "100%";
    }
  } catch (err) {
    container.createDiv({ cls: "ts-snake-error", text: `Snake render failed: ${err}` });
    return null;
  }

  return { grid, chain, cellsKey: key };
}
