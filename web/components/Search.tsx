"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CornerDownLeft, Search as SearchIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { extractUrl } from "@/lib/parse";
import { scrollToId, useParser } from "@/lib/parser";
import { PLATFORMS, platformById } from "@/lib/platforms";
import { cn, EASE } from "./ui";

export const SECTION_IDS = ["parse", "featured", "archive", "platforms", "about"] as const;

const SearchContext = createContext<{ open: () => void } | null>(null);
export const useSearch = () => useContext(SearchContext)!;

interface Item { key: string; group: string; label: string; meta?: string; run: () => void }

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SearchContext.Provider value={{ open }}>
      {children}
      <AnimatePresence>{isOpen && <Palette onClose={() => setOpen(false)} />}</AnimatePresence>
    </SearchContext.Provider>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const { history, parse, focusInput } = useParser();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const list: Item[] = [];
    const go = (fn: () => void) => () => { onClose(); fn(); };

    if (extractUrl(q)) {
      list.push({ key: "parse", group: t.search.parseThis, label: extractUrl(q)!, run: go(() => { scrollToId("parse"); parse(q); }) });
    }
    const hist = history
      .filter((h) => !query || [h.data.title, h.data.author.name, platformById(h.platform).name[lang]].join(" ").toLowerCase().includes(query))
      .slice(0, query ? 8 : 4);
    hist.forEach((h) => list.push({
      key: `h-${h.id}`, group: t.search.history, label: h.data.title || t.archive.untitled,
      meta: platformById(h.platform).name[lang], run: go(() => parse(h.source)),
    }));
    SECTION_IDS.filter((id) => !query || t.nav[id].toLowerCase().includes(query) || id.includes(query)).forEach((id, i) =>
      list.push({ key: `s-${id}`, group: t.search.sections, label: t.nav[id], meta: `0${i + 1}`, run: go(() => scrollToId(id)) }));
    if (query) {
      PLATFORMS.filter((p) => [p.name.zh, p.name.en, p.id].join(" ").toLowerCase().includes(query)).forEach((p) =>
        list.push({ key: `p-${p.id}`, group: t.search.platforms, label: p.name[lang], meta: p.glyph, run: go(focusInput) }));
    }
    return list;
  }, [q, history, t, lang, parse, focusInput, onClose]);

  useEffect(() => setActive(0), [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
  };

  let lastGroup = "";
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-bg/80 px-4 pt-[12vh]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog" aria-modal="true" aria-label={t.nav.search}
    >
      <motion.div
        className="w-full max-w-2xl border border-line bg-bg"
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-4 border-b border-line px-6">
          <SearchIcon size={18} strokeWidth={1.5} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search.placeholder}
            className="h-16 flex-1 bg-transparent text-lg outline-none focus-visible:outline-none placeholder:text-muted"
            aria-label={t.search.placeholder}
          />
          <kbd className="t-label hidden sm:block">Esc</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto py-2" role="listbox">
          {items.length === 0 && <li className="px-6 py-10 text-center text-muted">{t.search.none}</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? (lastGroup = it.group) : null;
            return (
              <li key={it.key}>
                {header && <p className="t-label px-6 pb-2 pt-4">{header}</p>}
                <button
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                  className={cn(
                    "flex w-full items-center gap-4 px-6 py-3 text-left transition-colors duration-300",
                    i === active ? "bg-surface" : "",
                  )}
                >
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.meta && <span className="t-label">{it.meta}</span>}
                  {i === active ? <CornerDownLeft size={14} className="text-accent" /> : <ArrowUpRight size={14} className="text-line" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="t-label border-t border-line px-6 py-3 normal-case tracking-[0.1em]">{t.search.hint}</p>
      </motion.div>
    </motion.div>
  );
}
