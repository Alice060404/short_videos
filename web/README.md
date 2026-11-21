# 无痕 Unmarked — 网页前端

短视频解析的网页前端。Next.js（App Router）构建，静态导出后与仓库里的 PHP 接口（`api/`）部署在同一站点。

技术栈：Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Motion · Lucide Icons

## 本地开发

需要两个服务：PHP 接口和 Next.js 开发服务器。

1. 在仓库根目录启动 PHP 接口（php.ini 需开启 `curl`，并设置 `display_errors = Off`）：

   ```bash
   php -S localhost:8000
   ```

2. 在 `web/` 目录安装依赖并启动前端：

   ```bash
   npm install
   npm run dev
   ```

3. 打开 <http://localhost:3000>。开发环境的接口地址写在 `.env.development` 里，默认指向 `http://localhost:8000/api/`。

## 构建与部署

```bash
npm run build
```

公开上线前请先阅读 [部署上线指南](../docs/部署上线指南.md)，里面有安全配置、Nginx 示例和上线检查清单。

产物输出到 `web/out/`。把 `out/` 里的全部文件复制到站点根目录，和 `api/` 文件夹放在一起即可。注意 `out/index.html` 会覆盖仓库根目录那个轻量版 `index.html`。

```
站点根目录/
├── api/            ← PHP 解析接口
├── _next/          ← 前端静态资源
├── index.html      ← 前端页面
└── icon.png
```

接口地址在 `.env.production` 里配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `/api/` | 解析接口目录。前后端分开部署时填完整地址 |
| `NEXT_PUBLIC_PROXY_BASE` | `/api/svproxyurl.php` | 媒体代理。可换成 `cf_sv_proxy` 的 Worker 地址 |

改完配置要重新构建。

## 目录结构

```
app/
  layout.tsx        字体、SEO 元信息、主题初始化脚本
  page.tsx          首页：组合各个区块
  globals.css       设计变量（颜色、字体、间距）、字号层级、按钮样式
components/
  Nav.tsx           固定导航：锚点、搜索、中/英、深/浅色、手机菜单
  Hero.tsx          首屏：超大标题 + 解析输入框
  Result.tsx        解析结果：媒体预览、信息、下载列表
  Featured.tsx      01 最近解析（无记录时显示使用方法）
  Archive.tsx       02 解析记录目录
  Platforms.tsx     03 支持的平台
  About.tsx         04 关于与声明
  Footer.tsx        页脚
  Search.tsx        Ctrl/⌘ + K 搜索面板
  ui.tsx            Reveal 动画、章节标题、封面图、背景网格
lib/
  platforms.ts      平台表（需与 api/sv.php 的 $platforms 保持一致）
  parse.ts          请求接口、字段归一化、代理下载地址
  parser.tsx        解析状态与本地历史记录（localStorage）
  i18n.tsx          中英文文案
  theme.tsx         深浅色主题
```

## 设计约定

- 颜色只用 `globals.css` 里的变量：`--bg`、`--fg`、`--muted`、`--line`、`--surface`、`--accent`。深色模式通过 `html[data-theme="dark"]` 切换。
- 字号层级：`t-hero`、`t-section`、`t-card`、`t-label`（等宽、大写、加宽字距）、`t-num`（等宽数字）。
- 布局用 `wrap`（统一最大宽度）和 `grid-12`（手机 4 栏，桌面 12 栏）。
- 动画时长 300–700ms，缓动统一用 `cubic-bezier(0.22, 1, 0.36, 1)`。系统开启“减少动态效果”时，动画会自动关闭。
