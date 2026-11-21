"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Check, Copy } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { downloadUrl, formatDuration, type ParseResult } from "@/lib/parse";
import { useParser } from "@/lib/parser";
import { platformById } from "@/lib/platforms";
import { cn, EASE } from "./ui";

interface Row { label: string; meta?: string; href: string }

export function ResultSection() {
  const { result } = useParser();
  return (
    <AnimatePresence mode="wait">
      {result && (
        <motion.section
          key={result.source + result.data.title}
          id="result"
          className="relative scroll-mt-20 border-t border-line"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <ResultBody result={result} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function ResultBody({ result }: { result: ParseResult }) {
  const { t, lang } = useI18n();
  const { platform: pid, data: d } = result;
  const platform = platformById(pid);
  const [copied, setCopied] = useState(false);

  const facts = [
    [t.result.type, t.types[d.type]],
    [t.result.date, d.publish_time],
    [t.result.quality, d.quality],
    [t.result.duration, formatDuration(d.duration)],
    [t.result.size, d.size_label],
  ].filter(([, v]) => v);

  const rows: Row[] = [];
  if (d.type === "video" && d.url) {
    rows.push({ label: t.result.video, meta: [d.quality, d.size_label].filter(Boolean).join(" · "), href: downloadUrl(d.url, pid, "video") });
    d.video_backup.forEach((b) => {
      if (b.url !== d.url) rows.push({ label: b.label || b.quality || t.result.video, meta: b.size_label, href: downloadUrl(b.url, pid, "video") });
    });
  }
  // 仅分离音画：分别提供无声视频与音频
  const split = d.type === "video" && !d.url && d.requires_merge;
  if (split && d.video_url) rows.push({ label: t.result.videoOnly, meta: d.quality, href: downloadUrl(d.video_url, pid, "video") });
  if (split && d.audio_url) rows.push({ label: t.result.audioOnly, href: downloadUrl(d.audio_url, pid, "video") });
  if (d.cover) rows.push({ label: t.result.cover, href: downloadUrl(d.cover, pid, "image") });
  if (d.music.url) rows.push({ label: t.result.music, meta: [d.music.title, d.music.author].filter(Boolean).join(" — "), href: d.music.url });

  const copy = async () => {
    if (!d.url) return;
    try { await navigator.clipboard.writeText(d.url); } catch { window.prompt(t.result.copy, d.url); }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="wrap grid-12 section-y !pt-16 md:!pt-24">
      {/* 媒体 */}
      <div className="col-span-full md:col-span-7">
        {d.type === "video" && (d.url || (split && d.video_url)) && (
          <div className="bg-[#0b0b0b]">
            <video
              src={downloadUrl(d.url || d.video_url, pid, "video", false)}
              poster={downloadUrl(d.cover, pid, "image", false) || undefined}
              controls
              playsInline
              preload="metadata"
              className="mx-auto block max-h-[78vh] w-full object-contain"
            />
          </div>
        )}

        {d.images.length > 0 && (
          <ul className="columns-2 gap-3 md:columns-3">
            {d.images.map((src, i) => (
              <li key={src + i} className="group relative mb-3 break-inside-avoid overflow-hidden bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={downloadUrl(src, pid, "image", false)} alt="" loading="lazy" referrerPolicy="no-referrer" className="block w-full transition-transform duration-700 group-hover:scale-[1.03]" />
                <a
                  href={downloadUrl(src, pid, "image")} target="_blank" rel="noopener noreferrer"
                  className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-bg/90 px-3 py-2 text-xs opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus:opacity-100"
                >
                  <span className="t-num">{String(i + 1).padStart(2, "0")}</span>
                  <ArrowDown size={14} strokeWidth={1.5} />
                </a>
              </li>
            ))}
          </ul>
        )}

        {d.live_photo.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {d.live_photo.map((lp, i) => (
              <li key={lp.video + i} className="bg-surface">
                <video
                  src={downloadUrl(lp.video, pid, "video", false)} poster={downloadUrl(lp.image, pid, "image", false)} muted loop playsInline preload="none"
                  onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()}
                  onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
                  className="block aspect-[3/4] w-full object-cover"
                />
                <div className="flex text-xs">
                  <a href={downloadUrl(lp.image, pid, "image")} target="_blank" rel="noopener noreferrer" className="flex-1 border-r border-line px-3 py-2 hover:text-accent">{t.result.liveImage}</a>
                  <a href={downloadUrl(lp.video, pid, "video")} target="_blank" rel="noopener noreferrer" className="flex-1 px-3 py-2 hover:text-accent">{t.result.liveVideo}</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 信息与下载 */}
      <div className="col-span-full mt-12 md:col-span-4 md:col-start-9 md:mt-0">
        <p className="t-label flex items-center gap-3">
          <span className="text-fg">{t.result.label}</span>
          <span className="h-px w-8 bg-accent" aria-hidden />
          <span>{platform.name[lang]}</span>
        </p>
        <h2 className="t-card mt-6 line-clamp-4 break-words">{d.title || t.archive.untitled}</h2>

        <div className="mt-8 flex items-center gap-3">
          {d.author.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={downloadUrl(d.author.avatar, pid, "image", false)} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover bg-surface" />
          )}
          <div>
            <p className="t-label">{t.result.author}</p>
            <p className="text-sm">{d.author.name || "—"}</p>
          </div>
        </div>

        <dl className="mt-8 border-t border-line">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line py-3 text-sm">
              <dt className="t-label self-center">{k}</dt>
              <dd className="t-num">{v}</dd>
            </div>
          ))}
        </dl>

        {rows.length > 0 && (
          <>
            <p className="t-label mt-10">{t.result.downloads}</p>
            <ul className="mt-3 border-t border-line">
              {rows.map((r, i) => (
                <li key={r.href + i}>
                  <a
                    href={r.href} target="_blank" rel="noopener noreferrer" download
                    className="group flex items-center gap-4 border-b border-line py-4"
                  >
                    <span className="t-num w-6 text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1.5">
                      {r.label}
                      {r.meta && <span className="ml-3 text-xs text-muted">{r.meta}</span>}
                    </span>
                    <span className="arrow-dot group-hover:border-fg group-hover:bg-fg group-hover:text-bg">
                      <ArrowDown size={15} strokeWidth={1.5} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}

        {d.url && (
          <button onClick={copy} className={cn("link-quiet mt-6 inline-flex items-center gap-2", copied && "!text-accent")}>
            {copied ? <Check size={14} /> : <Copy size={14} strokeWidth={1.5} />}
            {copied ? t.result.copied : t.result.copy}
          </button>
        )}
        {split && <p className="mt-8 text-xs leading-relaxed text-accent">{t.result.mergeTip}</p>}
        <p className="mt-8 text-xs leading-relaxed text-muted">{t.result.tip}</p>
      </div>
    </div>
  );
}
