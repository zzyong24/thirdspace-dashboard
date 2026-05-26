import { ItemView, Modal, WorkspaceLeaf, TFile } from "obsidian";
import type ThirdSpaceDashboard from "./main";
import {
  loadWorkspaceIndex, getWorkspaceStats, getDailyActivity,
  loadProductStatus, parseProducts, getRecentFiles,
  loadTodos, loadTodayWorklog, getVaultStats, getTodayWorklogPath,
  addTodoToWorklog, toggleTodoInWorklog, renameTodoInWorklog,
  type WorkspaceStats, type TodoItem, type VaultStats, type TodayWorklog,
} from "./data/vault-reader";
import { buildSnakeCells } from "./data/worklog-parser";
import { renderSnakeHeatmap, type SnakeRouteCache } from "./components/snake-heatmap";

export const VIEW_TYPE = "thirdspace-dashboard";

// ── Todo Input Modal ──────────────────────────────────────────
class TodoModal extends Modal {
  private onSubmit: (text: string) => void;
  constructor(app: any, onSubmit: (text: string) => void) {
    super(app); this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ts-modal");
    contentEl.createEl("h3", { text: "新增 Todo", cls: "ts-modal-title" });

    const input = contentEl.createEl("input", { type: "text", cls: "ts-modal-input" });
    input.placeholder = "输入 todo 内容，回车确认";
    input.focus();

    const submit = () => {
      const val = input.value.trim();
      if (val) { this.onSubmit(val); this.close(); }
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

    const row = contentEl.createDiv({ cls: "ts-modal-row" });
    const btn = row.createEl("button", { text: "添加", cls: "ts-modal-btn ts-modal-btn--primary" });
    btn.addEventListener("click", submit);
    const cancel = row.createEl("button", { text: "取消", cls: "ts-modal-btn" });
    cancel.addEventListener("click", () => this.close());
  }
  onClose() { this.contentEl.empty(); }
}

// ── Dashboard View ────────────────────────────────────────────
export class DashboardView extends ItemView {
  plugin: ThirdSpaceDashboard;
  private timer: number | null = null;
  private snakeRouteCache: SnakeRouteCache | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ThirdSpaceDashboard) {
    super(leaf); this.plugin = plugin;
  }

  getViewType()    { return VIEW_TYPE; }
  getDisplayText() { return "ThirdSpace"; }
  getIcon()        { return "layout-dashboard"; }

  async onOpen()  { this.containerEl.addClass("ts-root"); await this.render(); this.timer = window.setInterval(() => this.render(), 60_000); }
  onClose()       { if (this.timer) { clearInterval(this.timer); this.timer = null; } return Promise.resolve(); }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ts-dash");

    const [wsIndex, productMd, activity, todos, todayWorklog] = await Promise.all([
      loadWorkspaceIndex(this.app),
      loadProductStatus(this.app),
      getDailyActivity(this.app, 365),
      loadTodos(this.app),
      loadTodayWorklog(this.app),
    ]);

    const wsDirs    = wsIndex?.map(e => e.dir) ?? [];
    const wsStats   = await getWorkspaceStats(this.app, wsDirs);
    const vaultStats = getVaultStats(this.app);
    const recent    = getRecentFiles(this.app, 7);
    const products  = productMd ? parseProducts(productMd) : [];
    const snakeCells = buildSnakeCells(activity);
    const pending   = todos.filter(t => !t.done);

    // ── Header
    const hdr = contentEl.createDiv({ cls: "ts-hdr" });
    const hdrL = hdr.createDiv({ cls: "ts-hdr-left" });
    hdrL.createDiv({ cls: "ts-vault-title", text: (this.app.vault as any).getName?.() ?? "Vault" });
    const pill = hdrL.createDiv({ cls: `ts-pill ${wsIndex ? "ts-pill--ok" : "ts-pill--warn"}` });
    pill.setText(wsIndex ? `${wsStats.length} workspaces` : "no .thirdspace");
    const refreshBtn = hdr.createDiv({ cls: "ts-hdr-right" }).createEl("button", { cls: "ts-icon-btn", text: "↻" });
    refreshBtn.addEventListener("click", () => { this.snakeRouteCache = null; this.render(); });

    // ── Stats row
    this.renderStatsRow(contentEl, vaultStats, activity.filter(a=>a.count>0).length);

    // ── Snake heatmap
    const heatSec  = contentEl.createDiv({ cls: "ts-card ts-heatmap-card" });
    const heatHd   = heatSec.createDiv({ cls: "ts-card-head" });
    heatHd.createSpan({ cls: "ts-card-label", text: "ACTIVITY · PAST YEAR" });
    const streak = this.calcStreak(activity);
    if (streak > 0) heatHd.createSpan({ cls: "ts-card-meta", text: `⚡ ${streak}d streak` });
    const heatBody = heatSec.createDiv({ cls: "ts-heatmap-body" });
    window.setTimeout(async () => {
      const cache = await renderSnakeHeatmap(heatBody, snakeCells, this.snakeRouteCache ?? undefined);
      if (cache) this.snakeRouteCache = cache;
    }, 0);

    // ── Two columns
    const main  = contentEl.createDiv({ cls: "ts-main" });
    const left  = main.createDiv({ cls: "ts-left" });
    const right = main.createDiv({ cls: "ts-right" });

    // LEFT: workspaces
    const wsCard = left.createDiv({ cls: "ts-card" });
    wsCard.createDiv({ cls: "ts-card-label", text: "WORKSPACES" });
    this.renderWorkspaces(wsCard, wsStats);

    // LEFT: todos
    const todoCard = left.createDiv({ cls: "ts-card" });
    const tdHd = todoCard.createDiv({ cls: "ts-card-head" });
    tdHd.createSpan({ cls: "ts-card-label", text: "TODAY'S TODOS" });
    if (pending.length > 0) tdHd.createSpan({ cls: "ts-card-meta", text: `${pending.length} pending` });
    this.renderTodos(todoCard, todos);

    // RIGHT: today's worklog
    if (todayWorklog) {
      const logCard = right.createDiv({ cls: "ts-card" });
      const logHd   = logCard.createDiv({ cls: "ts-card-head" });
      logHd.createSpan({ cls: "ts-card-label", text: "TODAY" });
      logHd.createSpan({ cls: "ts-card-meta", text: new Date().toLocaleDateString("zh-CN",{month:"short",day:"numeric",weekday:"short"}) });
      this.renderTodayWorklog(logCard, todayWorklog);
    }

    // RIGHT: products
    if (products.length > 0) {
      const prodCard = right.createDiv({ cls: "ts-card" });
      prodCard.createDiv({ cls: "ts-card-label", text: "PRODUCTS" });
      this.renderProducts(prodCard, products);
    }

    // RIGHT: quick actions
    const actCard = right.createDiv({ cls: "ts-card" });
    actCard.createDiv({ cls: "ts-card-label", text: "QUICK" });
    this.renderActions(actCard);

    // RIGHT: recent
    if (recent.length > 0) {
      const recCard = right.createDiv({ cls: "ts-card" });
      recCard.createDiv({ cls: "ts-card-label", text: "RECENT" });
      this.renderRecent(recCard, recent);
    }
  }

  // ── Stats row
  private renderStatsRow(parent: HTMLElement, s: VaultStats, activeDays: number) {
    const row = parent.createDiv({ cls: "ts-stats-row" });
    for (const st of [
      { value: s.total, label: "files" }, { value: s.thisWeek, label: "this week" },
      { value: s.thisMonth, label: "this month" }, { value: activeDays, label: "active days" },
    ]) {
      const cell = row.createDiv({ cls: "ts-stat-cell" });
      cell.createDiv({ cls: "ts-stat-num", text: String(st.value) });
      cell.createDiv({ cls: "ts-stat-lbl", text: st.label });
    }
  }

  // ── Workspaces
  private renderWorkspaces(parent: HTMLElement, stats: WorkspaceStats[]) {
    const grid = parent.createDiv({ cls: "ts-ws-grid" });
    const maxFiles = Math.max(...stats.map(s => s.fileCount), 1);
    for (const ws of stats) {
      const age  = Date.now() - ws.lastModified;
      const card = grid.createDiv({ cls: `ts-ws-card ${age < 7*86_400_000 ? "ts-ws--hot" : age < 30*86_400_000 ? "ts-ws--warm" : "ts-ws--cold"}` });
      card.addEventListener("click", () => this.openWorkspace(ws.dir));
      const top = card.createDiv({ cls: "ts-ws-top" });
      top.createSpan({ cls: "ts-ws-icon", text: ws.icon });
      top.createSpan({ cls: "ts-ws-name", text: ws.desc });
      card.createDiv({ cls: "ts-ws-count", text: String(ws.fileCount) });
      card.createDiv({ cls: "ts-ws-bar" }).createDiv({ cls: "ts-ws-fill", attr: { style: `width:${Math.round(ws.fileCount/maxFiles*100)}%` } });
      card.createDiv({ cls: "ts-ws-time", text: ws.lastModified ? this.relTime(ws.lastModified) : "—" });
    }
  }

  // ── Todos (from today's worklog ## 今日Todo)
  private renderTodos(parent: HTMLElement, items: TodoItem[]) {
    const pending = items.filter(t => !t.done);
    const done    = items.filter(t => t.done);

    if (items.length === 0) {
      parent.createDiv({ cls: "ts-empty", text: 'No todos — click "记TODO" to add' });
      return;
    }
    const list = parent.createDiv({ cls: "ts-todo-list" });
    const SHOW = 8;
    for (const item of pending.slice(0, SHOW)) this.renderTodoRow(list, item);
    if (pending.length > SHOW) {
      const m = list.createDiv({ cls: "ts-todo-more" });
      m.setText(`+${pending.length - SHOW} more`);
      m.addEventListener("click", () => this.openFile(getTodayWorklogPath()));
    }
    if (done.length > 0)
      list.createDiv({ cls: "ts-todo-done-hint", text: `✓ ${done.length} completed` });
  }

  private renderTodoRow(parent: HTMLElement, item: TodoItem) {
    const row = parent.createDiv({ cls: `ts-todo-row${item.done ? " ts-todo-done" : ""}` });
    const chk = row.createEl("span", { cls: "ts-todo-chk", text: item.done ? "☑" : "☐" });
    const txt = row.createSpan({ cls: "ts-todo-txt", text: item.text });

    // checkbox 单击 = 切换完成状态
    chk.addEventListener("click", async e => {
      e.stopPropagation();
      await toggleTodoInWorklog(this.app, item);
      await this.render();
    });

    // 单击行 = 打开文件（detail >= 2 时忽略，让 dblclick 接管）
    row.addEventListener("click", e => {
      if ((e as MouseEvent).detail >= 2) return;
      this.openFile(getTodayWorklogPath());
    });

    // 双击行 = inline 编辑文字
    row.addEventListener("dblclick", e => {
      e.stopPropagation();
      // 替换文字 span 为 input
      const input = document.createElement("input");
      input.type  = "text";
      input.value = item.text;
      input.className = "ts-todo-edit-input";
      txt.replaceWith(input);
      input.focus();
      input.select();

      // 阻止 input 上的所有点击冒泡到 row，防止触发 openFile
      input.addEventListener("click",     e => e.stopPropagation());
      input.addEventListener("mousedown", e => e.stopPropagation());

      let saved = false;
      const save = async () => {
        if (saved) return;
        saved = true;
        const newText = input.value.trim();
        if (newText && newText !== item.text) {
          await renameTodoInWorklog(this.app, item, newText);
        }
        await this.render();
      };

      input.addEventListener("keydown", async ev => {
        if (ev.key === "Enter")  { ev.preventDefault(); await save(); }
        if (ev.key === "Escape") { saved = true; await this.render(); }
      });
      input.addEventListener("blur", save);
    });
  }

  // ── Today: ## 今日重点 + ## 重点记录 时间线 ──────────────────
  private renderTodayWorklog(parent: HTMLElement, today: TodayWorklog) {
    const body = parent.createDiv({ cls: "ts-log-body" });

    // 今日重点：人工写的摘要
    if (today.highlights.length > 0) {
      const hl = body.createDiv({ cls: "ts-log-highlights" });
      for (const h of today.highlights) {
        const row = hl.createDiv({ cls: "ts-log-highlight-row" });
        row.createSpan({ cls: "ts-log-hl-bullet", text: "◆" });
        row.createSpan({ cls: "ts-log-hl-text",   text: h });
      }
    }

    // 重点记录：时间轴，只展示时间+标题
    if (today.entries.length > 0) {
      const tl = body.createDiv({ cls: "ts-log-timeline" });
      for (const e of today.entries) {
        const row = tl.createDiv({ cls: "ts-log-tl-row" });
        row.addEventListener("click", () => this.openFile(getTodayWorklogPath()));
        row.createSpan({ cls: "ts-log-time",  text: e.time });
        row.createSpan({ cls: "ts-log-tl-sep", text: "—" });
        row.createSpan({ cls: "ts-log-tl-title", text: e.title });
      }
    }
  }

  // ── Products
  private renderProducts(parent: HTMLElement, products: ReturnType<typeof parseProducts>) {
    const ICONS: Record<string, string> = { active:"●", watch:"◐", paused:"○" };
    const list = parent.createDiv({ cls: "ts-prod-list" });
    for (const p of products) {
      const row = list.createDiv({ cls: `ts-prod-row ts-prod--${p.status}` });
      row.createSpan({ cls: "ts-prod-dot", text: ICONS[p.status]??"·" });
      const info = row.createDiv({ cls: "ts-prod-info" });
      info.createDiv({ cls: "ts-prod-name", text: p.name });
      if (p.milestone) info.createDiv({ cls: "ts-prod-mile", text: p.milestone });
    }
  }

  // ── Quick actions
  private renderActions(parent: HTMLElement) {
    const ACTIONS = [
      { label: "新笔记",  icon: "✎", fn: () => this.createNewNote() },
      { label: "今日志",  icon: "◈", fn: () => this.openTodayLog() },
      { label: "记TODO",  icon: "☐", fn: () => this.openTodoModal() },
      { label: "搜索",    icon: "⊕", fn: () => this.runCmd("global-search:open") },
      { label: "收件箱",  icon: "↓", fn: () => this.openWorkspace("01-收件箱") },
    ];
    const grid = parent.createDiv({ cls: "ts-act-grid" });
    for (const a of ACTIONS) {
      const btn = grid.createEl("button", { cls: "ts-act-btn" });
      btn.createDiv({ cls: "ts-act-icon", text: a.icon });
      btn.createDiv({ cls: "ts-act-label", text: a.label });
      btn.addEventListener("click", a.fn);
    }
  }

  // ── Recent
  private renderRecent(parent: HTMLElement, files: ReturnType<typeof getRecentFiles>) {
    const list = parent.createDiv({ cls: "ts-rec-list" });
    for (const f of files) {
      const row = list.createDiv({ cls: "ts-rec-row" });
      row.addEventListener("click", () => this.openFile(f.path));
      row.createSpan({ cls: "ts-rec-ws",   text: f.workspace.replace(/^\d+-/,"").slice(0,6) });
      row.createSpan({ cls: "ts-rec-name", text: f.name });
      row.createSpan({ cls: "ts-rec-time", text: this.relTime(f.mtime) });
    }
  }

  // ── Helpers
  private calcStreak(activity: {date:string;count:number}[]): number {
    const set = new Set(activity.filter(a=>a.count>0).map(a=>a.date));
    let streak = 0; const d = new Date();
    while (true) { const s = d.toISOString().slice(0,10); if (!set.has(s)) break; streak++; d.setDate(d.getDate()-1); }
    return streak;
  }
  private relTime(ms: number): string {
    const d = Math.floor((Date.now()-ms)/86_400_000);
    if (d===0) return "today"; if (d===1) return "1d";
    if (d<7) return `${d}d`; if (d<30) return `${Math.floor(d/7)}w`;
    return `${Math.floor(d/30)}mo`;
  }
  private async openFile(path: string) {
    const f = this.app.vault.getAbstractFileByPath(path) as TFile|null;
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }
  private openWorkspace(dir: string) {
    const fe = (this.app as any).internalPlugins?.plugins?.["file-explorer"]?.instance;
    const folder = this.app.vault.getAbstractFileByPath(dir);
    if (fe && folder) { fe.revealInFolder(folder); try { fe.setCollapseState?.(folder,false); } catch {} }
    const first = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(dir+"/") && !f.path.includes("WORKSPACE") && !f.path.includes("AGENTS"))
      .sort((a,b) => b.stat.mtime - a.stat.mtime)[0];
    if (first) this.openFile(first.path);
  }
  private async createNewNote() {
    const now = new Date();
    const date = now.toISOString().slice(0,10).replace(/-/g,"");
    const ts   = now.toISOString().slice(0,19).replace("T"," ");
    const path = `01-收件箱/${date}_untitled.md`;
    const fm   = ["---",`title: "Untitled"`,`type: note`,`topic: work`,`workspace: "01-收件箱"`,`created: "${ts}"`,`modified: "${ts}"`,`tags: ["note","draft"]`,`source: manual`,`status: draft`,"---","",""].join("\n");
    try { const f = await this.app.vault.create(path, fm); await this.app.workspace.getLeaf(false).openFile(f); }
    catch { const f = this.app.vault.getAbstractFileByPath(path) as TFile|null; if (f) await this.app.workspace.getLeaf(false).openFile(f); }
  }
  private async openTodayLog() {
    const today = new Date();
    const ymd   = today.toISOString().slice(0,10).replace(/-/g,"");
    const wd    = ["日","一","二","三","四","五","六"][today.getDay()];
    const path  = `02-日记/工作日志/${ymd}_工作日志_周${wd}.md`;
    const f = this.app.vault.getAbstractFileByPath(path) as TFile|null;
    if (f) { await this.app.workspace.getLeaf(false).openFile(f); return; }
    const all = this.app.vault.getMarkdownFiles();
    const log = all.find(f => f.path.startsWith("02-日记/工作日志/") && f.basename.startsWith(ymd));
    if (log) await this.app.workspace.getLeaf(false).openFile(log);
    else this.openWorkspace("02-日记");
  }
  private openTodoModal() {
    new TodoModal(this.app, async (text) => {
      await addTodoToWorklog(this.app, text);
      await this.render();
    }).open();
  }
  private runCmd(id: string) { try { (this.app as any).commands.executeCommandById(id); } catch {} }
}
