export type MediaType = "video" | "image" | "live";

export type PlatformId =
  | "douyin"
  | "kuaishou"
  | "xiaohongshu"
  | "bilibili"
  | "weibo"
  | "toutiao"
  | "pipixia"
  | "pipigx"
  | "zuiyou"
  | "youtube"
  | "x";

export interface Platform {
  id: PlatformId;
  /** 分类网格里的大号识别汉字 */
  glyph: string;
  name: { zh: string; en: string };
  /** 用于从分享文本里识别平台，需与 api/sv.php 的 $platforms 保持一致 */
  keywords: string[];
  /** 单平台接口路径（相对 API_BASE） */
  path: string;
  types: MediaType[];
}

export const PLATFORMS: Platform[] = [
  { id: "douyin", glyph: "抖", name: { zh: "抖音", en: "Douyin" }, keywords: ["douyin", "iesdouyin"], path: "douyin/douyin.php", types: ["video", "image", "live"] },
  { id: "kuaishou", glyph: "快", name: { zh: "快手", en: "Kuaishou" }, keywords: ["kuaishou"], path: "kuaishou/ksjx.php", types: ["video", "image"] },
  { id: "xiaohongshu", glyph: "书", name: { zh: "小红书", en: "Xiaohongshu" }, keywords: ["xhs", "xiaohongshu", "rednote"], path: "xiaohongshu/xhsjx.php", types: ["video", "image", "live"] },
  { id: "bilibili", glyph: "哔", name: { zh: "哔哩哔哩", en: "Bilibili" }, keywords: ["bilibili", "b23"], path: "bilibili/bilibili.php", types: ["video"] },
  { id: "weibo", glyph: "微", name: { zh: "微博", en: "Weibo" }, keywords: ["weibo", "t.cn"], path: "weibo.php", types: ["video"] },
  { id: "toutiao", glyph: "头", name: { zh: "今日头条", en: "Toutiao" }, keywords: ["toutiao"], path: "toutiao.php", types: ["video"] },
  { id: "pipixia", glyph: "虾", name: { zh: "皮皮虾", en: "Pipixia" }, keywords: ["pipix"], path: "ppxia.php", types: ["video", "image"] },
  { id: "pipigx", glyph: "搞", name: { zh: "皮皮搞笑", en: "Pipigx" }, keywords: ["ippzone", "pipigx"], path: "pipigx.php", types: ["video"] },
  { id: "zuiyou", glyph: "右", name: { zh: "最右", en: "Zuiyou" }, keywords: ["izuiyou"], path: "zuiyou.php", types: ["video"] },
  { id: "youtube", glyph: "油", name: { zh: "YouTube", en: "YouTube" }, keywords: ["youtube.com", "youtu.be"], path: "youtube/youtube.php", types: ["video"] },
  // "://x.com" 带边界，避免误匹配 pipix.com 等以 x.com 结尾的域名
  { id: "x", glyph: "推", name: { zh: "X（推特）", en: "X (Twitter)" }, keywords: ["://x.com", ".x.com/", "twitter.com"], path: "x/x.php", types: ["video", "image"] },
];

export const platformById = (id: PlatformId) => PLATFORMS.find((p) => p.id === id)!;

export function matchPlatform(text: string): Platform | null {
  const lower = text.toLowerCase();
  return PLATFORMS.find((p) => p.keywords.some((k) => lower.includes(k))) ?? null;
}
