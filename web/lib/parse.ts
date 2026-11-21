import { matchPlatform, type MediaType, type PlatformId } from "./platforms";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "/api/").replace(/\/?$/, "/");
export const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_BASE ?? "/api/svproxyurl.php";
/** 直链校验 Referer 的平台，下载需经代理 */
export const PROXY_PLATFORMS: PlatformId[] = ["douyin", "weibo", "bilibili"];

export interface Author { name: string; id?: string; avatar: string }
export interface VideoBackup { label?: string; quality?: string; url: string; size_label?: string }
export interface LivePhoto { image: string; video: string }
export interface Music { title?: string; author?: string; url?: string; cover?: string }

export interface ParsedMedia {
  type: MediaType;
  title: string;
  author: Author;
  cover: string;
  url: string | null;
  quality: string;
  duration: number | null;
  size_label: string;
  publish_time: string;
  images: string[];
  live_photo: LivePhoto[];
  video_backup: VideoBackup[];
  music: Music;
  /** 仅分离音画（如部分 YouTube 视频）：url 为空，需分别下载 video_url / audio_url */
  requires_merge: boolean;
  video_url: string | null;
  audio_url: string | null;
}

export interface ParseResult {
  platform: PlatformId;
  source: string;
  data: ParsedMedia;
}

export type ParseErrorCode = "empty" | "noUrl" | "unsupported" | "badFormat" | "timeout" | "network" | "server";

export class ParseError extends Error {
  constructor(public code: ParseErrorCode, public detail?: string) {
    super(detail ?? code);
  }
}

export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>，。；！？]+/i);
  return m ? m[0].replace(/[,.;!?]+$/, "") : null;
}

const httpsify = (u: unknown) => (typeof u === "string" ? u.replace(/^http:\/\//i, "https://") : "");
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const optUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : null);

/** 纯数字时间戳（秒或毫秒）转成 YYYY-MM-DD，其他格式原样保留 */
function publishTime(v: unknown): string {
  const s = str(v);
  if (!/^\d{9,13}$/.test(s)) return s;
  const d = new Date(Number(s) * (s.length > 10 ? 1 : 1000));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 统一 JSON 3.0 归一化。
 * B 站、头条、皮皮虾、皮皮搞笑、最右等旧接口字段不统一（user / avatar / video / imgurl / description）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalize(d: any): ParsedMedia {
  const author: Author =
    d.author && typeof d.author === "object"
      ? { name: str(d.author.name), id: str(d.author.id), avatar: httpsify(d.author.avatar) }
      : { name: str(d.author ?? d.user?.name), avatar: httpsify(d.avatar ?? d.user?.avatar) };
  const url: string | null = d.url || d.video || null;
  let images: string[] = Array.isArray(d.images) ? d.images : [];
  if (!images.length && d.imgurl) images = ([] as string[]).concat(d.imgurl).filter(Boolean);
  const live: LivePhoto[] = Array.isArray(d.live_photo) ? d.live_photo : [];
  let type: MediaType = d.type;
  if (!["video", "image", "live"].includes(type)) type = url ? "video" : live.length ? "live" : "image";
  return {
    type,
    title: str(d.title || d.desc || d.description),
    author,
    cover: httpsify(d.cover),
    url,
    quality: str(d.quality),
    duration: typeof d.duration === "number" ? d.duration : null,
    size_label: str(d.size_label),
    publish_time: publishTime(d.publish_time || d.time),
    images: images.map(httpsify),
    live_photo: live,
    video_backup: Array.isArray(d.video_backup) ? d.video_backup.filter((b: VideoBackup) => b?.url) : [],
    music: d.music && typeof d.music === "object" && !Array.isArray(d.music) ? d.music : {},
    requires_merge: d.requires_merge === true,
    video_url: optUrl(d.video_url),
    audio_url: optUrl(d.audio_url),
  };
}

export async function parseShare(text: string): Promise<ParseResult> {
  const input = text.trim();
  if (!input) throw new ParseError("empty");
  const source = extractUrl(input);
  if (!source) throw new ParseError("noUrl");
  const platform = matchPlatform(input);
  if (!platform) throw new ParseError("unsupported");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let raw: string;
  try {
    const res = await fetch(`${API_BASE}${platform.path}?url=${encodeURIComponent(source)}`, { signal: ctrl.signal });
    raw = await res.text();
  } catch (e) {
    throw new ParseError((e as Error).name === "AbortError" ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }

  let json: { code?: number; msg?: string; data?: unknown };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ParseError("badFormat");
  }
  if (json.code !== 200 || !json.data || Array.isArray(json.data)) {
    throw new ParseError("server", json.msg);
  }
  return { platform: platform.id, source, data: normalize(json.data) };
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/** 生成下载地址：防盗链平台走代理，其他平台直接返回直链 */
export function downloadUrl(url: string | null | undefined, platform: PlatformId, mediatype: "video" | "image", download = true): string {
  if (!url) return "";
  // The API issues signed media URLs; only presentation flags may change.
  try {
    const signed = new URL(url);
    if (signed.origin === "https://media.litcheng.com" && signed.searchParams.has("sig")) {
      signed.searchParams.set("mediatype", mediatype);
      signed.searchParams.set("download", String(download));
      return signed.toString();
    }
  } catch { /* Existing non-proxied URLs retain their normal handling. */ }
  if (!PROXY_PLATFORMS.includes(platform)) return url;
  const sep = PROXY_BASE.includes("?") ? "&" : "?";
  return `${PROXY_BASE}${sep}proxyurl=${encodeURIComponent(b64(url))}&type=${platform}&mediatype=${mediatype}&download=${download}`;
}

export function formatDuration(sec: number | null): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
