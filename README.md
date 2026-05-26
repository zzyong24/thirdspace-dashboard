# ThirdSpace Dashboard

> [ThirdSpace](https://github.com/zzyong24/thirdspace-vault-template) 知识库系统的 Obsidian 控制台插件。

## 界面预览

```
┌─────────────────────────────────────────────────────────┐
│  My Vault   ● 8 workspaces                          ↻   │
├─────────────────────────────────────────────────────────┤
│  1,247 files │ 12 this week │ 38 this month │ 180 days  │
├─────────────────────────────────────────────────────────┤
│  ACTIVITY · PAST YEAR                    ⚡ 3d streak   │
│  [贡献热力图 — GitHub 贪吃蛇动画风格]                     │
│  Mon ░░▒▓█░░░░▒▒▓░░▒▓█░░                               │
│  Wed ░▒▓░░░░▒▓▓░░░▒▒▓░░░                               │
│  Fri     Jan    Feb    Mar    Apr    May                 │
├──────────────────┬──────────────────────────────────────┤
│ WORKSPACES       │ TODAY              5月26日 周二       │
│ ↓ 收件箱   12  ▶ │ ◆ Dashboard 插件迭代完成              │
│ ◈ 日记    234  ▶ │  16:00 — 多 bug 修复                 │
│ ◎ 知识    456  ▶ │  16:30 — 系统自洽                    │
│ ▲ 项目     89  ▶ │                                      │
├──────────────────┤ TODAY'S TODOS      2 pending          │
│ TODAY'S TODOS    │ ☐ 修复蛇形热力图   [双击切换]         │
│ ☑ 完成 Dashboard │ ☐ 更新 MANUAL.md                    │
│ ☐ 推送到 GitHub  ├──────────────────────────────────────┤
│                  │ QUICK                                 │
│                  │ ✎新笔记 ◈今日志 ☐记TODO ⊕搜索 ↓收件箱│
└──────────────────┴──────────────────────────────────────┘
```

## 功能

| 区域 | 说明 |
|------|------|
| **统计栏** | 总文件数 / 本周 / 本月 / 活跃天数（基于 frontmatter 时间而非文件系统时间） |
| **ACTIVITY** | 过去一年贡献热力图，GitHub 贪吃蛇动画风格，含月份和星期标签 |
| **WORKSPACES** | 8 个工作区文件数量 + 最近活跃时间，点击跳转，颜色区分冷热活跃度 |
| **TODAY** | 今日工作日志：`## 今日重点` 摘要 + `## 重点记录` 时间轴 |
| **TODAY'S TODOS** | 读取今日工作日志 `## 今日Todo`，**双击行**或点击 ☐ 切换完成状态 |
| **QUICK** | 新笔记（自动填写规范 frontmatter）/ 今日志 / **记TODO弹框** / 搜索 / 收件箱 |
| **PRODUCTS** | 读取 `04-项目/product-status.md`，展示产品/项目状态 |
| **RECENT** | 最近 7 天修改的文件，基于 frontmatter `modified` 字段 |

## 安装

### 方式一：通过 ThirdSpace 模板初始化（推荐）

插件已预装在 [thirdspace-vault-template](https://github.com/zzyong24/thirdspace-vault-template)，初始化后直接启用即可。

### 方式二：手动安装

1. 下载 [最新 Release](https://github.com/zzyong24/thirdspace-dashboard/releases) 中的 `main.js`、`styles.css`、`manifest.json`
2. 复制到 `<your-vault>/.obsidian/plugins/thirdspace-dashboard/`
3. Obsidian → 设置 → 第三方插件 → 启用 **ThirdSpace Dashboard**

### 方式三：从源码构建

```bash
git clone https://github.com/zzyong24/thirdspace-dashboard
cd thirdspace-dashboard
npm install
npm run build
# 构建产物: main.js, main.css
```

## 使用说明

### 打开控制台

点击左侧工具栏的 📊 图标，或 `Cmd+P` 搜索 `ThirdSpace`。

### Today's Todos

Todos 存储在今日工作日志的 `## 今日Todo` section：
```markdown
## 今日Todo
- [ ] 未完成事项
- [x] 已完成事项 ✅ 2026-05-26
```

- **点击 ☐/☑**：切换完成状态
- **双击行**：切换完成状态（更方便）
- **单击行**：打开工作日志文件
- **QUICK → 记TODO**：弹框快速添加，按 Enter 确认

### 记TODO 弹框

点击 Quick 面板中的 `☐ 记TODO`，输入内容后 Enter 或点击「添加」，自动追加到今日工作日志 `## 今日Todo` 章节。如当日工作日志不存在，自动创建。

### TODAY 展示逻辑

读取今日工作日志文件（`02-日记/工作日志/YYYYMMDD_工作日志_周X.md`）：

- `## 今日重点` → 展示为摘要行（最多 3 条）
- `## 重点记录` → 展示为时间轴（`HH:MM — 标题`，最多 5 条）

### 工作区活跃度颜色

| 颜色 | 含义 |
|------|------|
| 🟢 绿色 | 7 天内有文件修改 |
| 🟡 黄色 | 30 天内有修改 |
| ⚫ 灰色 | 超过 30 天未活跃 |

## 与 ThirdSpace 系统集成

本插件与 [thirdspace-vault-template](https://github.com/zzyong24/thirdspace-vault-template) 深度集成：

- **工作日志**：git commit 自动写入 `## Git 提交`，AI session 结束自动写入 `## 重点记录`
- **Frontmatter**：所有时间统计基于 frontmatter `created`/`modified`，不依赖文件系统时间
- **工作区路由**：与 `.thirdspace/workspace-index.yaml` 对应

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 监听模式（开发时实时构建）
npm run build      # 生产构建（包含 TypeScript 类型检查）
```

**技术栈**：TypeScript · esbuild · Obsidian API · snk（贡献图动画引擎）

## License

MIT
