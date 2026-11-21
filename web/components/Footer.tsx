"use client";

import { ArrowUp, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { scrollToId, useParser } from "@/lib/parser";
import { PLATFORMS } from "@/lib/platforms";
import { SECTION_IDS } from "./Search";
import { Reveal } from "./ui";

const REPO = "https://github.com/jiuhunwl/short_videos";

export function Footer() {
  const { t, lang } = useI18n();
  const { focusInput } = useParser();

  const linkCls = "link-quiet inline-block py-1";

  return (
    <footer className="relative border-t border-fg pt-20 md:pt-28">
      <div className="wrap">
        <Reveal className="grid-12">
          <p className="col-span-full font-serif text-2xl font-semibold leading-snug md:col-span-6 md:text-3xl">{t.footer.statement}</p>
        </Reveal>

        <div className="grid-12 mt-20 gap-y-12 md:mt-28">
          <FooterCol title={t.footer.nav} className="md:col-span-3">
            {SECTION_IDS.map((id) => (
              <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id); }} className={linkCls}>{t.nav[id]}</a>
            ))}
          </FooterCol>
          <FooterCol title={t.footer.platforms} className="md:col-span-3">
            <div className="grid grid-cols-2 gap-x-6">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={focusInput} className={`${linkCls} text-left`}>{p.name[lang]}</button>
              ))}
            </div>
          </FooterCol>
          <FooterCol title={t.footer.resources} className="md:col-span-3">
            <a href={REPO} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
              {t.footer.repo} <ArrowUpRight size={13} strokeWidth={1.5} />
            </a>
            <a href={`${REPO}/blob/main/docs/${lang === "zh" ? "%E8%A7%86%E9%A2%91%E8%A7%A3%E6%9E%90%E7%BB%9F%E4%B8%80JSON%E6%A0%BC%E5%BC%8F3.0" : "Unified-Video-Parsing-JSON-Format-3.0"}.md`} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
              {t.footer.docs} <ArrowUpRight size={13} strokeWidth={1.5} />
            </a>
          </FooterCol>
          <FooterCol title={t.footer.social} className="md:col-span-3">
            <a href={REPO} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
              GitHub <ArrowUpRight size={13} strokeWidth={1.5} />
            </a>
          </FooterCol>
        </div>
      </div>

      {/* 大号品牌文字 */}
      <div className="wrap mt-24 overflow-hidden md:mt-32" aria-hidden>
        <p className="select-none whitespace-nowrap text-[17.5vw] font-semibold leading-[0.8] tracking-[-0.05em] lg:text-[clamp(10rem,17.5vw,15.5rem)]">
          Unmarked<span className="text-accent">.</span>
        </p>
      </div>

      <div className="wrap mt-10 flex flex-col gap-4 border-t border-line py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="t-label normal-case tracking-[0.08em]">
          © {new Date().getFullYear()} 无痕 Unmarked · MIT License · {t.footer.rights}
        </p>
        <button onClick={() => scrollToId("parse")} className="link-quiet inline-flex items-center gap-2 self-start sm:self-auto">
          {t.footer.top} <ArrowUp size={13} strokeWidth={1.5} />
        </button>
      </div>
    </footer>
  );
}

function FooterCol({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`col-span-2 ${className ?? ""}`}>
      <p className="t-label mb-5">{title}</p>
      <div className="flex flex-col items-start">{children}</div>
    </div>
  );
}
