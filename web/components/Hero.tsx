"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { scrollToId, useParser } from "@/lib/parser";
import { cn, EASE } from "./ui";

export function Hero() {
  const { t } = useI18n();
  const { input, setInput, inputRef, parse, status, error } = useParser();
  const reduce = useReducedMotion();
  const [notice, setNotice] = useState<string | null>(null);
  const loading = status === "loading";

  const enter = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : "0.6em" },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay: 0.15 + i * 0.12, ease: EASE },
  });
  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: EASE },
  });

  const paste = async () => {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      inputRef.current?.focus();
    } catch {
      setNotice(t.hero.pasteDenied);
    }
  };

  const message = error
    ? error.code === "server"
      ? `${t.errors.server}${error.detail ? `：${error.detail}` : ""}`
      : t.errors[error.code]
    : notice;

  return (
    <section id="parse" className="relative flex min-h-[100svh] scroll-mt-0 flex-col pb-8 pt-28 md:pt-36">
      <div className="wrap grid-12 flex-1 content-start">
        {/* 期数标记 */}
        <motion.div {...fade(0)} className="col-span-full flex items-center justify-between border-b border-line pb-4">
          <span className="t-label text-fg">{t.hero.issue}</span>
          <span className="t-label">{t.hero.edition}</span>
        </motion.div>

        {/* 超大标题：逐行渐入，第二行错位 */}
        <h1 className="t-hero col-span-full mt-12 md:mt-16">
          {t.hero.title.map((line, i) => (
            <span key={i} className={cn("block overflow-hidden pb-[0.06em]", i === 1 && "pl-[1em] md:pl-[25%]")}>
              <motion.span className="relative isolate inline-block" {...enter(i)}>
                {line}
                {i === 1 && (
                  <motion.span
                    aria-hidden
                    className="absolute bottom-[0.1em] left-0 -z-10 h-[0.2em] w-full origin-left bg-accent/30"
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                    transition={{ duration: 0.9, delay: 0.9, ease: EASE }}
                  />
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        {/* 品牌介绍 */}
        <motion.div {...fade(0.55)} className="col-span-full mt-12 md:col-span-4 md:mt-20">
          <p className="t-label mb-5">{t.hero.eyebrow}</p>
          <p className="max-w-[28em] text-[1.0625rem] leading-[1.95] text-muted">{t.hero.intro}</p>
        </motion.div>

        {/* 解析输入：即首屏 CTA */}
        <motion.form
          {...fade(0.7)}
          className="col-span-full mt-12 md:col-span-7 md:col-start-6 md:mt-20"
          onSubmit={(e) => { e.preventDefault(); parse(); }}
        >
          <label htmlFor="share-input" className="t-label flex justify-between">
            <span><span className="text-fg">01</span> — {t.hero.inputLabel}</span>
            <span className="hidden md:inline">Enter ↵</span>
          </label>
          <div className="relative">
            <textarea
              id="share-input"
              ref={inputRef}
              value={input}
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); parse(); }
              }}
              placeholder={t.hero.placeholder}
              className="mt-4 block w-full resize-none border-0 border-b border-fg/70 bg-transparent pb-4 text-lg leading-relaxed outline-none transition-colors duration-500 placeholder:text-muted/70 focus:border-accent md:text-xl"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden>
              {loading && <div className="indeterminate h-full w-2/5 bg-accent" />}
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? t.hero.parsing : t.hero.submit}
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={paste} className="link-quiet">{t.hero.paste}</button>
            {input && (
              <button type="button" onClick={() => { setInput(""); inputRef.current?.focus(); }} className="link-quiet">
                {t.hero.clear}
              </button>
            )}
          </div>
          <p role="alert" aria-live="polite" className={cn("mt-6 min-h-[1.5em] text-sm", error ? "text-danger" : "text-muted")}>
            {message && <>— {message}</>}
          </p>
        </motion.form>
      </div>

      {/* 滚动提示 */}
      <motion.div {...fade(1)} className="wrap mt-10 flex items-end justify-between">
        <a
          href="#featured"
          onClick={(e) => { e.preventDefault(); scrollToId("featured"); }}
          className="group flex items-center gap-4"
        >
          <span className="relative block h-12 w-px overflow-hidden bg-line">
            <span className="scroll-cue absolute inset-0 bg-fg" />
          </span>
          <span className="t-label transition-colors duration-300 group-hover:text-fg">{t.hero.scroll}</span>
        </a>
        <span className="t-label hidden sm:block">{t.hero.facts}</span>
      </motion.div>
    </section>
  );
}
