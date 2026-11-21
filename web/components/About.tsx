"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { Reveal, cn } from "./ui";

export function About() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["8%", "-8%"]);

  return (
    <section id="about" className="relative scroll-mt-16 border-t border-line py-[clamp(8rem,18vw,16rem)]">
      <div className="wrap grid-12">
        <Reveal className="col-span-full mb-10 md:col-span-3 md:mb-0">
          <p className="t-label flex items-center gap-3">
            <span className="text-fg">{t.about.no}</span>
            <span className="h-px w-8 bg-accent" aria-hidden />
            <span>{t.about.en}</span>
          </p>
        </Reveal>

        {/* 宣言式标题 */}
        <Reveal className="col-span-full md:col-span-9" delay={0.08}>
          <h2 className="t-section">
            {t.about.title.map((line, i) => (
              <span key={i} className={cn("block", i === 1 && "md:pl-[2em]", i === 2 && "text-muted md:pl-[4em]")}>{line}</span>
            ))}
          </h2>
        </Reveal>

        {/* 品牌视觉：取景框 + 印章式汉字 */}
        <div ref={ref} className="col-span-3 mt-20 md:col-span-4 md:col-start-2 md:mt-32">
          <motion.div style={reduce ? undefined : { y }} className="relative aspect-[4/5] border border-line">
            {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"].map((c) => (
              <span key={c} className={cn("absolute h-6 w-6 -m-px border-fg", c)} aria-hidden />
            ))}
            <span className="absolute inset-0 grid place-items-center font-serif text-[clamp(7rem,16vw,14rem)] font-semibold leading-none text-fg/90 select-none" aria-hidden>
              痕
            </span>
            <span className="t-label absolute bottom-5 left-5">Frame 001</span>
            <span className="t-label absolute right-5 top-5">16:9 · 9:16</span>
          </motion.div>
        </div>

        <div className="col-span-full mt-16 md:col-span-4 md:col-start-8 md:mt-48">
          {t.about.body.map((p, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <p className={cn("leading-[1.95] text-muted", i === 0 && "text-lg text-fg")}>{p}</p>
              {i === 0 && <div className="my-8 h-px w-12 bg-accent" />}
            </Reveal>
          ))}
          <ul className="mt-14 border-t border-line">
            {t.about.principles.map((p, i) => (
              <Reveal as="li" key={p.k} delay={0.1 + i * 0.06} y={12} className="flex items-baseline gap-5 border-b border-line py-5">
                <span className="t-num text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-serif text-lg font-semibold">{p.k}</span>
                <span className="ml-auto text-right text-sm text-muted">{p.v}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
