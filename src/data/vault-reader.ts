import type { App, TFile } from "obsidian";

// ── Date helpers ─────────────────────────────────────────────
function parseFmDate(s: unknown): number {
  if (!s || typeof s !== "string") return 0;
  try { return new Date(s.replace(" ", "T")).getTime() || 0; } catch { return 0; }
}
function fileCreated(app: App, f: TFile): number {
  const fm = app.metadataCache.getFileCache(f)?.frontmatter;
  return parseFmDate(fm?.created) || f.stat.ctime || f.stat.mtime;
}
function fileModified(app: App, f: TFile): number {
  const fm = app.metadataCache.getFileCache(f)?.frontmatter;
  return parseFmDate(fm?.modified) || f.stat.mtime;
}

// ── Interfaces ───────────────────────────────────────────────
export interface WorkspaceEntry  { dir: string; skill: string; desc: string; }
export interface WorkspaceStats  { dir: string; icon: string; desc: string; fileCount: number; lastModified: number; }
export interface DailyActivity   { date: string; count: number; }
export interface TodoItem        { text: string; done: boolean; }
export interface VaultStats      { total: number; thisWeek: number; thisMonth: number; activeDays: number; }
export interface WorklogEntry    { time: string; title: string; }
export interface TodayWorklog    { highlights: string[]; entries: WorklogEntry[]; }

// ── Skip rules ───────────────────────────────────────────────
// Use exact path-segment matching, not substring — prevents false positives
// on notes whose names happen to contain "INDEX", "README", etc.
const SKIP_DIRS  = new Set(["_legacy", ".thirdspace"]);
const SKIP_NAMES = new Set(["WORKSPACE", "AGENTS", "CLAUDE", "README", "INDEX"]);

function shouldSkip(f: TFile): boolean {
  const parts = f.path.split("/");
  if (parts.some(p => SKIP_DIRS.has(p))) return true;
  if (SKIP_NAMES.has(f.basename))         return true;
  return false;
}

// ── Constants ────────────────────────────────────────────────
const WORKSPACE_ICONS: Record<string, string> = {
  "00-系统": "⚙", "01-收件箱": "↓", "02-日记": "◈",
  "03-知识": "◎", "04-项目": "▲", "05-资源": "⬡",
  "06-输出": "→", "99-归档": "⊞",
};
const DEFAULT_WORKSPACES = [
  "00-系统","01-收件箱","02-日记","03-知识",
  "04-项目","05-资源","06-输出","99-归档",
];
const WEEKDAYS = ["日","一","二","三","四","五","六"];

// ── Worklog path helper ──────────────────────────────────────
export function getTodayWorklogPath(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0,10).replace(/-/g,"");
  return `02-日记/工作日志/${ymd}_工作日志_周${WEEKDAYS[now.getDay()]}.md`;
}

// ── Workspace index ──────────────────────────────────────────
export async function loadWorkspaceIndex(app: App): Promise<WorkspaceEntry[] | null> {
  try {
    const content = await app.vault.adapter.read(".thirdspace/workspace-index.yaml");
    return parseWorkspaceYaml(content);
  } catch { return null; }
}

function parseWorkspaceYaml(content: string): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  let cur: Partial<WorkspaceEntry> | null = null;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- dir:")) {
      if (cur?.dir) entries.push(cur as WorkspaceEntry);
      cur = { dir: line.replace("- dir:","").trim().replace(/['"]/g,""), skill:"", desc:"" };
    } else if (cur) {
      if (line.startsWith("skill:")) cur.skill = line.replace("skill:","").trim().replace(/['"]/g,"");
      if (line.startsWith("desc:"))  cur.desc  = line.replace("desc:","").trim().replace(/['"]/g,"");
    }
  }
  if (cur?.dir) entries.push(cur as WorkspaceEntry);
  return entries;
}

// ── Workspace stats ──────────────────────────────────────────
export async function getWorkspaceStats(app: App, dirs: string[]): Promise<WorkspaceStats[]> {
  const allFiles = app.vault.getMarkdownFiles();
  const targetDirs = dirs.length > 0 ? dirs : DEFAULT_WORKSPACES;
  return targetDirs.map(dir => {
    const files = allFiles.filter(f =>
      f.path.startsWith(dir+"/") &&
      !SKIP_DIRS.has(f.path.split("/")[1] ?? "")  // 只排除 _legacy/.thirdspace 子目录
    );
    const lastMod = files.reduce((m,f) => Math.max(m, fileModified(app, f)), 0);
    return { dir, icon: WORKSPACE_ICONS[dir] ?? "◇", desc: dir.replace(/^\d+-/,""), fileCount: files.length, lastModified: lastMod };
  });
}

// ── Activity ─────────────────────────────────────────────────
export async function getDailyActivity(app: App, days = 365): Promise<DailyActivity[]> {
  const cutoff = Date.now() - days * 86_400_000;
  const countMap: Record<string, number> = {};
  for (const f of app.vault.getMarkdownFiles()) {
    if (shouldSkip(f)) continue;
    const ts = fileCreated(app, f);
    if (ts < cutoff) continue;
    const date = new Date(ts).toISOString().slice(0,10);
    countMap[date] = (countMap[date] ?? 0) + 1;
  }
  return Object.entries(countMap).map(([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date));
}

export function getVaultStats(app: App): VaultStats {
  const files = app.vault.getMarkdownFiles().filter(f => !shouldSkip(f));
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000, monthAgo = now - 30 * 86_400_000;
  const daySet = new Set<string>();
  let week = 0, month = 0;
  for (const f of files) {
    const ts = fileCreated(app, f);
    if (ts > weekAgo)  week++;
    if (ts > monthAgo) month++;
    if (ts > now - 365 * 86_400_000) daySet.add(new Date(ts).toISOString().slice(0,10));
  }
  return { total: files.length, thisWeek: week, thisMonth: month, activeDays: daySet.size };
}

export function getRecentFiles(app: App, days = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  return app.vault.getMarkdownFiles()
    .filter(f => fileModified(app, f) > cutoff && !shouldSkip(f))
    .sort((a,b) => fileModified(app, b) - fileModified(app, a))
    .slice(0, 10)
    .map(f => ({ path: f.path, name: f.basename, workspace: f.path.split("/")[0]??"", mtime: fileModified(app, f) }));
}

// ── Products ─────────────────────────────────────────────────
export async function loadProductStatus(app: App): Promise<string | null> {
  try {
    const f = app.vault.getAbstractFileByPath("04-项目/product-status.md") as TFile|null;
    if (f) return await app.vault.read(f);
  } catch {}
  return null;
}

export function parseProducts(md: string): Array<{name:string; status:string; milestone:string}> {
  const results: Array<{name:string;status:string;milestone:string}> = [];
  let currentStatus = "unknown";
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      if (line.includes("🟢")) currentStatus = "active";
      else if (line.includes("🟡")) currentStatus = "watch";
      else if (line.includes("🔴") || line.includes("搁置") || line.includes("放弃")) currentStatus = "paused";
    }
    if (line.startsWith("### ")) results.push({ name: line.replace("### ","").trim(), status: currentStatus, milestone:"" });
    if (line.includes("当前里程碑") && results.length > 0) {
      const last = results[results.length-1];
      if (!last.milestone) last.milestone = line.replace(/.*：\s*/,"").trim().slice(0,45);
    }
  }
  return results.filter(p => p.status !== "unknown").slice(0, 6);
}

// ── Todos (from today's worklog ## 今日Todo) ─────────────────
export async function loadTodos(app: App): Promise<TodoItem[]> {
  try {
    const f = app.vault.getAbstractFileByPath(getTodayWorklogPath()) as TFile | null;
    if (!f) return [];
    const md = await app.vault.read(f);
    return parseTodosFromMd(md);
  } catch { return []; }
}

export function parseTodosFromMd(md: string): TodoItem[] {
  const items: TodoItem[] = [];
  let inTodoSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("## 今日Todo")) { inTodoSection = true; continue; }
    if (line.startsWith("## ") && !line.startsWith("## 今日Todo")) { inTodoSection = false; }
    if (!inTodoSection) continue;
    const m = line.match(/^- \[( |x)\] (.+)/);
    if (m) {
      const text = m[2].replace(/✅ \d{4}-\d{2}-\d{2}/g,"").trim();
      if (text) items.push({ text, done: m[1]==="x" });
    }
  }
  return items;
}

export async function addTodoToWorklog(app: App, text: string): Promise<void> {
  const path = getTodayWorklogPath();
  let f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) {
    const now = new Date();
    const ts  = now.toISOString().slice(0,19).replace("T"," ");
    const wd  = WEEKDAYS[now.getDay()];
    const ds  = now.toISOString().slice(0,10);
    const tpl = `---\ntitle: "${ds} 周${wd} 工作日志"\ntype: "worklog"\ntopic: "work"\nworkspace: "02-日记"\ncreated: "${ts}"\nmodified: "${ts}"\ntags: ["worklog","work"]\nsource: "agent"\nstatus: "active"\n---\n# ${ds} 周${wd} 工作日志\n\n## 今日重点\n\n## 今日Todo\n\n## 重点记录\n\n## 关键决策\n\n## 明日计划\n`;
    f = await app.vault.create(path, tpl);
  }
  const md = await app.vault.read(f);
  const lines = md.split("\n");
  const secIdx = lines.findIndex(l => l.trim() === "## 今日Todo");
  const newItem = `- [ ] ${text}`;
  if (secIdx >= 0) {
    // insert right after the section header (skip blank lines)
    let insertAt = secIdx + 1;
    while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
    lines.splice(insertAt, 0, newItem);
  } else {
    lines.push("", "## 今日Todo", "", newItem, "");
  }
  await app.vault.modify(f, lines.join("\n"));
}

export async function toggleTodoInWorklog(app: App, item: TodoItem): Promise<void> {
  const path = getTodayWorklogPath();
  const f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const today = new Date().toISOString().slice(0,10);
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[( |x)\] (.+)/);
    if (!m) continue;
    const cleaned = m[2].replace(/✅ \d{4}-\d{2}-\d{2}/g,"").trim();
    if (cleaned !== item.text) continue;
    if (item.done) {
      lines[i] = lines[i].replace(/^- \[x\]/, "- [ ]").replace(/ ✅ \d{4}-\d{2}-\d{2}/g,"");
    } else {
      lines[i] = lines[i].replace(/^- \[ \]/, "- [x]") + ` ✅ ${today}`;
    }
    await app.vault.modify(f, lines.join("\n"));
    return;
  }
}

export async function renameTodoInWorklog(app: App, item: TodoItem, newText: string): Promise<void> {
  const path = getTodayWorklogPath();
  const f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(- \[[ x]\] )(.+)/);
    if (!m) continue;
    const cleaned = m[2].replace(/✅ \d{4}-\d{2}-\d{2}/g,"").trim();
    if (cleaned !== item.text) continue;
    // 保留完成状态和 ✅ 日期
    const doneDate = m[2].match(/ ✅ \d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    lines[i] = `${m[1]}${newText}${doneDate}`;
    await app.vault.modify(f, lines.join("\n"));
    return;
  }
}

// ── Today's worklog entries (## 重点记录) ────────────────────
export async function loadTodayWorklog(app: App): Promise<TodayWorklog | null> {
  try {
    const today = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const logFile = app.vault.getMarkdownFiles().find(f =>
      f.path.startsWith("02-日记/工作日志/") && f.basename.startsWith(today)
    );
    if (!logFile) return null;
    const md = await app.vault.read(logFile);
    const highlights = parseHighlights(md);
    const entries    = parseWorklogEntries(md);
    if (!highlights.length && !entries.length) return null;
    return { highlights, entries };
  } catch { return null; }
}

/** 读取 ## 今日重点 下的非空行（去掉 Markdown 格式符） */
export function parseHighlights(md: string): string[] {
  const lines: string[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("## 今日重点")) { inSection = true; continue; }
    if (line.startsWith("## ") && !line.startsWith("## 今日重点")) { inSection = false; continue; }
    if (!inSection) continue;
    const t = line.replace(/^[-*]\s+/, "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
    if (t) lines.push(t.slice(0, 90));
  }
  return lines.slice(0, 3);
}

/** 读取 ## 重点记录 下的 ### HH:MM — 标题 条目（只要时间+标题，不要 body） */
export function parseWorklogEntries(md: string): WorklogEntry[] {
  const entries: WorklogEntry[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("## 重点记录")) { inSection = true; continue; }
    if (line.startsWith("## ") && !line.startsWith("## 重点记录")) { inSection = false; continue; }
    if (!inSection) continue;
    const h3 = line.match(/^###\s+(\d{1,2}:\d{2})\s*[—\-–]\s*(.+)/);
    if (h3) entries.push({ time: h3[1], title: h3[2].trim() });
  }
  return entries.slice(0, 5);
}
