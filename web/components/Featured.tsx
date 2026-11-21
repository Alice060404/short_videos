"use client";

import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/parse";
import { useParser, type HistoryEntry } from "@/lib/parser";
import { platformById } from "@/lib/platforms";
import { Cover, Reveal, SectionHeader, cn } from "./ui";

export function Featured() {
  const { t } = useI18n();
  const { history } = useParser();
  const items = history.slice(0, 3);

  return (
    <section id="featured" className="relative scroll-mt-16 section-y">
      <div className="wrap">
        {items.length ? (
          <>
            <SectionHeader no={t.featured.no} en={t.featured.en} title={t.featured.title} />
            <div className="grid-12 mt-16 gap-y-14 md:mt-24">
              <FeatureCard entry={items[0]} index={0} big className="col-span-full md:col-span-7" />
              <div className="col-span-full flex flex-col gap-14 md:col-span-4 md:col-start-9 md:pt-32">
                {items.slice(1).map((h, i) => <FeatureCard key={h.id} entry={h} index={i + 1} />)}
                {items.length < 3 && (
                  <Reveal className="border-t border-line pt-6">
                    <p className="font-serif text-xl leading-relaxed">{t.result.tip}</p>
                    <p className="t-label mt-6">{t.featured.note}</p>
                  </Reveal>
                )}
              </div>
            </div>
          </>
        ) : (
          <HowItWorks />
        )}
      </div>
    </section>
  );
}

function FeatureCard({ entry, index, big, className }: { entry: HistoryEntry; index: number; big?: boolean; className?: string }) {
  const { t, lang } = useI18n();
  const { parse } = useParser();
  const p = platformById(entry.platform);
  const d = entry.data;

  return (
    <Reveal className={className} delay={index * 0.08}>
      <button onClick={() => parse(entry.source)} className="group block w-full text-left" aria-label={`${t.featured.open}：${d.title}`}>
        <Cover src={d.cover || d.images[0]} platform={entry.platform} className={big ? "aspect-[4/5] md:aspect-[5/6]" : "aspect-[4/3]"} />
        <div className="mt-6 flex items-start gap-5">
          <span className="t-num pt-1 text-sm text-muted">{String(index + 1).padStart(2, "0")}</span>
          <div className="flex-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-2">
            <p className="t-label flex gap-3">
              <span className="text-accent">{p.name[lang]}</span>
              <span>{t.types[d.type]}</span>
              <span>{formatDate(entry.savedAt)}</span>
            </p>
            <h3 className={cn("mt-3 line-clamp-2 break-words", big ? "t-card" : "font-serif text-xl font-semibold leading-snug")}>
              {d.title || t.archive.untitled}
            </h3>
            {d.author.name && <p className="mt-2 text-sm text-muted">{d.author.name}</p>}
          </div>
          <span className="arrow-dot mt-1 group-hover:border-fg group-hover:bg-fg group-hover:text-bg">
            <ArrowUpRight size={15} strokeWidth={1.5} />
          </span>
        </div>
      </button>
    </Reveal>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  return (
    <>
      <SectionHeader no={t.featured.no} en={t.featured.emptyEn} title={t.featured.emptyTitle} />
      <ol className="grid-12 mt-16 gap-y-12 md:mt-28">
        {t.featured.steps.map((s, i) => (
          <Reveal
            as="li"
            key={s.t}
            delay={i * 0.1}
            className={cn(
              "col-span-full border-t border-line pt-6",
              i === 0 && "md:col-span-5",
              i === 1 && "md:col-span-3 md:col-start-7 md:mt-24",
              i === 2 && "md:col-span-3 md:col-start-10 md:mt-48",
            )}
          >
            <span className={cn("t-num block text-muted", i === 0 ? "text-[clamp(4rem,9vw,8rem)] leading-none text-fg" : "text-5xl")}>
              0{i + 1}
            </span>
            <h3 className="t-card mt-8">{s.t}</h3>
            <p className="mt-4 max-w-[22em] leading-relaxed text-muted">{s.d}</p>
          </Reveal>
        ))}
      </ol>
      <Reveal className="mt-16 md:mt-6"><p className="t-label">{t.featured.note}</p></Reveal>
    </>
  );
}
