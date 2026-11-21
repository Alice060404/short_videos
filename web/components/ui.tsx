"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { platformById, type PlatformId } from "@/lib/platforms";

export const EASE = [0.22, 1, 0.36, 1] as const;

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** 进入视口时渐入并轻微上移 */
export function Reveal({
  children, className, delay = 0, y = 28, as = "div",
}: { children: ReactNode; className?: string; delay?: number; y?: number; as?: "div" | "li" | "section" | "header" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/** 章节标题：编号 / 英文标签 + 中文标题（有意识换行） */
export function SectionHeader({
  no, en, title, aside, className,
}: { no: string; en: string; title: string[]; aside?: ReactNode; className?: string }) {
  return (
    <header className={cn("grid-12 items-end", className)}>
      <Reveal className="col-span-full md:col-span-3 mb-6 md:mb-0 self-start md:pt-4">
        <p className="t-label flex items-center gap-3">
          <span className="text-fg">{no}</span>
          <span className="h-px w-8 bg-accent" aria-hidden />
          <span>{en}</span>
        </p>
      </Reveal>
      <Reveal className="col-span-full md:col-span-7" delay={0.08}>
        <h2 className="t-section">
          {title.map((line, i) => (
            <span key={i} className={cn("block", i > 0 && "md:pl-[1.5em]")}>{line}</span>
          ))}
        </h2>
      </Reveal>
      {aside && (
        <Reveal className="col-span-full md:col-span-2 mt-6 md:mt-0 md:justify-self-end" delay={0.16}>
          {aside}
        </Reveal>
      )}
    </header>
  );
}

/** 封面图：懒加载、轻微视差、加载失败时退回平台汉字 */
export function Cover({
  src, platform, className, parallax = true, alt = "",
}: { src?: string; platform: PlatformId; className?: string; parallax?: boolean; alt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-5%", "5%"]);
  const showImg = src && !failed;

  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-surface", className)}>
      {showImg ? (
        <motion.div className="absolute inset-[-6%]" style={parallax && !reduce ? { y } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
        </motion.div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-serif text-[clamp(4rem,10vw,9rem)] text-line select-none">{platformById(platform).glyph}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-fg/0 transition-colors duration-700 group-hover:bg-fg/10" />
    </div>
  );
}

/** 背景 12 栏细线网格 */
export function GridLines() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 hidden md:block">
      <div className="wrap grid-12 h-full">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-full border-l border-line/45 last:border-r" />
        ))}
      </div>
    </div>
  );
}
