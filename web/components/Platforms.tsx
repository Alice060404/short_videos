"use client";

import { useI18n } from "@/lib/i18n";
import { useParser } from "@/lib/parser";
import { PLATFORMS } from "@/lib/platforms";
import { cn, Reveal, SectionHeader } from "./ui";

export function Platforms() {
  const { t, lang } = useI18n();
  const { history, focusInput } = useParser();
  const counts = history.reduce<Record<string, number>>((acc, h) => ((acc[h.platform] = (acc[h.platform] ?? 0) + 1), acc), {});

  return (
    <section id="platforms" className="relative scroll-mt-16 section-y border-t border-line">
      <div className="wrap">
        <SectionHeader no={t.platforms.no} en={t.platforms.en} title={t.platforms.title} />

        {/* 细线网格：用 gap-px + 背景色画出 1px 分割线 */}
        <Reveal className="mt-16 md:mt-24">
          <ul className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3">
            {PLATFORMS.map((p, i) => (
              <li key={p.id} className="bg-bg">
                <button
                  onClick={focusInput}
                  title={t.platforms.hint}
                  className="group relative flex h-full w-full flex-col justify-between overflow-hidden p-5 text-left md:min-h-[22rem] md:p-8"
                >
                  <div className="flex items-start justify-between">
                    <span className="t-num text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="t-label hidden sm:block">{t.platforms.times(counts[p.id] ?? 0)}</span>
                  </div>

                  <span
                    className="my-8 block font-serif text-[clamp(4.5rem,11vw,9.5rem)] font-semibold leading-none text-fg/90 transition-[transform,color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-2 group-hover:text-accent md:my-10"
                    aria-hidden
                  >
                    {p.glyph}
                  </span>

                  <div>
                    <p className="text-base font-medium tracking-[0.08em] md:text-lg">{p.name[lang]}</p>
                    <p className="t-label mt-2 tracking-[0.04em] md:tracking-[0.18em]">
                      <span className="hidden md:inline">{lang === "zh" ? p.name.en : p.name.zh} · </span>
                      {p.types.map((ty) => t.types[ty]).join(" / ")}
                    </p>
                  </div>

                  <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-x-100" />
                </button>
              </li>
            ))}
            {/* 补齐最后一行的空格，避免露出分割线底色：两栏用 sm 以下的格，三栏用 md 以上的格 */}
            {Array.from({ length: Math.max((2 - (PLATFORMS.length % 2)) % 2, (3 - (PLATFORMS.length % 3)) % 3) }, (_, i) => (
              <li
                key={`fill-${i}`}
                aria-hidden
                className={cn(
                  "bg-bg",
                  i >= (2 - (PLATFORMS.length % 2)) % 2 && "hidden md:block",
                  i >= (3 - (PLATFORMS.length % 3)) % 3 && "md:hidden",
                )}
              />
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
