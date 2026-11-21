"use client";

import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/parse";
import { useParser } from "@/lib/parser";
import { platformById } from "@/lib/platforms";
import { Reveal, SectionHeader } from "./ui";

export function Archive() {
  const { t, lang } = useI18n();
  const { history, parse, clearHistory, focusInput } = useParser();

  const aside = history.length ? (
    <div className="flex items-center gap-6 md:flex-col md:items-end md:gap-2">
      <span className="t-label">{t.archive.count(history.length)}</span>
      <button onClick={() => window.confirm(t.archive.confirmClear) && clearHistory()} className="link-quiet">
        {t.archive.clear}
      </button>
    </div>
  ) : null;

  return (
    <section id="archive" className="relative scroll-mt-16 section-y border-t border-line">
      <div className="wrap">
        <SectionHeader no={t.archive.no} en={t.archive.en} title={t.archive.title} aside={aside} />

        <ol className="mt-16 border-t border-fg md:mt-24">
          {history.length === 0 && (
            <li className="grid-12 border-b border-line py-8">
              <span className="t-num col-span-1 text-sm text-muted md:col-span-2">NO.000</span>
              <div className="col-span-3 md:col-span-8">
                <p className="font-serif text-xl">{t.archive.empty}</p>
                <button onClick={focusInput} className="link-quiet mt-2">{t.archive.emptyHint}</button>
              </div>
            </li>
          )}
          {history.map((h, i) => {
            const p = platformById(h.platform);
            const no = String(history.length - i).padStart(3, "0");
            return (
              <Reveal as="li" key={h.id} y={12} delay={Math.min(i, 6) * 0.04}>
                <button
                  onClick={() => parse(h.source)}
                  className="group grid-12 w-full items-center border-b border-line py-6 text-left transition-colors duration-500 hover:bg-surface/60 md:py-7"
                >
                  <span className="t-num col-span-1 text-sm text-muted transition-colors duration-500 group-hover:text-accent md:col-span-2">
                    NO.{no}
                  </span>
                  <div className="col-span-3 min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-2 md:col-span-6">
                    <p className="truncate font-serif text-lg font-semibold md:text-[1.375rem]">{h.data.title || t.archive.untitled}</p>
                    <p className="mt-1 truncate text-sm text-muted">{h.data.author.name}</p>
                  </div>
                  <span className="t-label col-span-2 col-start-2 mt-3 md:col-span-2 md:col-start-auto md:mt-0 md:text-right">
                    {p.name[lang]} · {t.types[h.data.type]}
                  </span>
                  <span className="t-num col-span-1 mt-3 text-xs text-muted md:mt-0 md:text-right">{formatDate(h.savedAt)}</span>
                  <span className="col-span-1 hidden justify-self-end md:block">
                    <span className="arrow-dot group-hover:border-fg group-hover:bg-fg group-hover:text-bg">
                      <ArrowRight size={15} strokeWidth={1.5} />
                    </span>
                  </span>
                </button>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
