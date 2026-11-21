"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ParseErrorCode } from "./parse";
import type { MediaType } from "./platforms";

export type Lang = "zh" | "en";

const zh = {
  brand: "无痕",
  nav: { parse: "解析", featured: "最近", archive: "目录", platforms: "平台", about: "关于", search: "搜索", menu: "菜单", close: "关闭" },
  theme: { light: "浅色", dark: "深色", toggle: "切换主题" },
  hero: {
    issue: "NO.001 — 短视频解析",
    edition: "VOL.01 / 2026",
    title: ["去掉水印", "留下作品"],
    eyebrow: "A quiet tool for keeping what you watch",
    intro: "把分享链接贴进来，得到没有水印的视频、原图与实况。不登录，不存文件，只把作品本身交还给你。",
    inputLabel: "粘贴分享链接",
    placeholder: "粘贴整段分享文案或链接……",
    submit: "开始解析",
    parsing: "解析中",
    paste: "从剪贴板粘贴",
    clear: "清空",
    pasteDenied: "浏览器没有允许读取剪贴板，请手动粘贴。",
    scroll: "Scroll to explore",
    facts: "11 platforms · No cookie · No login",
  },
  errors: {
    empty: "先粘贴一条分享链接。",
    noUrl: "没有在文本里找到链接。",
    unsupported: "暂不支持这个平台的链接。",
    badFormat: "接口返回的数据格式不正确。",
    timeout: "请求超时，请稍后再试。",
    network: "无法连接到解析服务。",
    server: "解析失败",
  } satisfies Record<ParseErrorCode, string>,
  result: {
    label: "Result",
    heading: "解析结果",
    author: "作者",
    type: "类型",
    date: "发布",
    quality: "画质",
    size: "大小",
    duration: "时长",
    downloads: "下载",
    video: "视频",
    cover: "封面",
    music: "背景音乐",
    image: "图片",
    imageIndex: (n: number) => `原图 ${String(n).padStart(2, "0")}`,
    liveImage: "实况 · 图",
    liveVideo: "实况 · 视频",
    content: "正文",
    copy: "复制直链",
    copied: "已复制",
    copyText: "复制文案",
    copiedText: "文案已复制",
    downloadText: "下载文案",
    expand: "展开全文",
    collapse: "收起",
    tip: "直链带有时效。若下载时开始播放，可在播放页右键或长按另存为。",
    reparse: "重新解析",
    videoOnly: "视频（无声）",
    audioOnly: "音频",
    mergeTip: "该视频只有分离的画面和音频流，需分别下载后用 FFmpeg 等工具合并。",
  },
  types: { video: "视频", image: "图集", live: "实况" } satisfies Record<MediaType, string>,
  featured: {
    no: "01",
    en: "Recently kept",
    title: ["最近", "留下的"],
    open: "打开",
    emptyEn: "How it works",
    emptyTitle: ["三步", "就够了"],
    steps: [
      { t: "复制分享链接", d: "在 App 里点分享，复制链接或整段分享文案。" },
      { t: "粘贴并解析", d: "自动识别平台，取回无水印的视频、原图与实况。" },
      { t: "保存作品", d: "预览、选择画质，然后下载到本地。" },
    ],
    note: "记录只保存在你的浏览器里。",
  },
  archive: {
    no: "02",
    en: "Archive",
    title: ["每一次", "都在这里"],
    clear: "清空记录",
    confirmClear: "确定清空全部解析记录吗？",
    empty: "还没有记录。",
    emptyHint: "在上方粘贴第一条链接。",
    untitled: "未命名作品",
    count: (n: number) => `${n} 条`,
  },
  platforms: {
    no: "03",
    en: "Platforms",
    title: ["挑一个", "开始解析"],
    times: (n: number) => (n ? `解析 ${n} 次` : "尚未解析"),
    hint: "点击后回到输入框",
  },
  about: {
    no: "04",
    en: "About",
    title: ["作品属于作者", "我们只负责", "把它带回来"],
    body: [
      "无痕是一个开源的短视频解析工具。它读取平台公开的作品信息，返回不带水印的媒体直链，不保存任何视频或图片。",
      "解析出的内容，版权归原平台与作者所有。请仅用于个人学习与备份，转载或商用前先取得授权。",
    ],
    principles: [
      { k: "不存储", v: "服务器只转发，不留文件" },
      { k: "不登录", v: "无需账号，也不需要 Cookie" },
      { k: "开源", v: "MIT 协议，代码可自行部署" },
    ],
  },
  footer: {
    statement: "安静地保存　你在意的作品",
    nav: "导航",
    platforms: "平台",
    resources: "资源",
    social: "社交",
    repo: "源代码",
    docs: "接口文档",
    top: "回到顶部",
    rights: "解析内容版权归原作者所有",
  },
  search: {
    placeholder: "搜索记录、平台，或直接粘贴链接",
    parseThis: "解析这个链接",
    sections: "章节",
    history: "记录",
    platforms: "平台",
    none: "没有找到相关内容",
    hint: "↑↓ 选择　↵ 打开　Esc 关闭",
  },
  lang: { switch: "Switch to English", short: "EN" },
};

export type Dict = typeof zh;

const en: Dict = {
  brand: "Unmarked",
  nav: { parse: "Parse", featured: "Recent", archive: "Archive", platforms: "Platforms", about: "About", search: "Search", menu: "Menu", close: "Close" },
  theme: { light: "Light", dark: "Dark", toggle: "Toggle theme" },
  hero: {
    issue: "NO.001 — Video extraction",
    edition: "VOL.01 / 2026",
    title: ["Lose the mark,", "keep the work."],
    eyebrow: "A quiet tool for keeping what you watch",
    intro: "Paste a share link and get the video, original images and live photos — without watermarks. No login, no stored files. Just the work itself.",
    inputLabel: "Paste a share link",
    placeholder: "Paste a link or the whole share text…",
    submit: "Extract",
    parsing: "Extracting",
    paste: "Paste from clipboard",
    clear: "Clear",
    pasteDenied: "Clipboard access was denied. Please paste manually.",
    scroll: "Scroll to explore",
    facts: "11 platforms · No cookie · No login",
  },
  errors: {
    empty: "Paste a share link first.",
    noUrl: "No link found in the text.",
    unsupported: "This platform isn't supported yet.",
    badFormat: "The API returned malformed data.",
    timeout: "The request timed out. Try again later.",
    network: "Couldn't reach the extraction service.",
    server: "Extraction failed",
  },
  result: {
    label: "Result",
    heading: "Extracted",
    author: "Author",
    type: "Type",
    date: "Published",
    quality: "Quality",
    size: "Size",
    duration: "Length",
    downloads: "Downloads",
    video: "Video",
    cover: "Cover",
    music: "Soundtrack",
    image: "Image",
    imageIndex: (n: number) => `Image ${String(n).padStart(2, "0")}`,
    liveImage: "Live · still",
    liveVideo: "Live · motion",
    content: "Post text",
    copy: "Copy link",
    copied: "Copied",
    copyText: "Copy text",
    copiedText: "Text copied",
    downloadText: "Save text",
    expand: "Read more",
    collapse: "Collapse",
    tip: "Links expire. If a download starts playing instead, right-click or long-press and choose Save as.",
    reparse: "Extract again",
    videoOnly: "Video (no audio)",
    audioOnly: "Audio",
    mergeTip: "Only separate video and audio streams are available. Download both and merge them with a tool such as FFmpeg.",
  },
  types: { video: "Video", image: "Gallery", live: "Live photo" },
  featured: {
    no: "01",
    en: "Recently kept",
    title: ["Recently", "kept"],
    open: "Open",
    emptyEn: "How it works",
    emptyTitle: ["Three steps.", "That's all."],
    steps: [
      { t: "Copy the link", d: "Tap share in the app and copy the link or the full share text." },
      { t: "Paste & extract", d: "The platform is detected and the clean media is fetched." },
      { t: "Keep the work", d: "Preview, pick a quality, and save it locally." },
    ],
    note: "History lives only in your browser.",
  },
  archive: {
    no: "02",
    en: "Archive",
    title: ["Every link,", "kept here"],
    clear: "Clear history",
    confirmClear: "Clear all history?",
    empty: "Nothing here yet.",
    emptyHint: "Paste your first link above.",
    untitled: "Untitled",
    count: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
  },
  platforms: {
    no: "03",
    en: "Platforms",
    title: ["Pick one,", "begin"],
    times: (n: number) => (n ? `${n} extracted` : "Not yet used"),
    hint: "Click to jump to the input",
  },
  about: {
    no: "04",
    en: "About",
    title: ["The work belongs", "to its author.", "We just bring it back."],
    body: [
      "Unmarked is an open-source short-video extractor. It reads publicly available post data and returns clean media links. Nothing is stored.",
      "All extracted content remains the property of the platforms and creators. Use it for personal study and backup; get permission before reposting or commercial use.",
    ],
    principles: [
      { k: "No storage", v: "The server relays, never keeps files" },
      { k: "No login", v: "No account, no cookies" },
      { k: "Open source", v: "MIT licensed, self-hostable" },
    ],
  },
  footer: {
    statement: "Quietly keep the work you care about",
    nav: "Navigate",
    platforms: "Platforms",
    resources: "Resources",
    social: "Social",
    repo: "Source code",
    docs: "API format",
    top: "Back to top",
    rights: "Content rights belong to the original creators",
  },
  search: {
    placeholder: "Search history, platforms, or paste a link",
    parseThis: "Extract this link",
    sections: "Sections",
    history: "History",
    platforms: "Platforms",
    none: "No matches",
    hint: "↑↓ select   ↵ open   Esc close",
  },
  lang: { switch: "切换到中文", short: "中" },
};

const dicts: Record<Lang, Dict> = { zh, en };

interface I18nValue { lang: Lang; t: Dict; setLang: (l: Lang) => void }
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  }, []);

  return <I18nContext.Provider value={{ lang, t: dicts[lang], setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
