"use client";

import { AnimatePresence, motion } from "motion/react";
import { Moon, Search as SearchIcon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { scrollToId } from "@/lib/parser";
import { useTheme } from "@/lib/theme";
import { SECTION_IDS, useSearch } from "./Search";
import { cn, EASE } from "./ui";

export function Nav() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { open: openSearch } = useSearch();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("parse");
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTION_IDS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
  }, [menu]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu(false);
    scrollToId(id);
  };

  const toggleLang = () => setLang(lang === "zh" ? "en" : "zh");

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-500",
          scrolled || menu ? "border-line bg-bg" : "border-transparent bg-transparent",
        )}
      >
        <div
          className="wrap flex items-center justify-between transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ height: scrolled ? 60 : 84 }}
        >
          <a href="#parse" onClick={go("parse")} className="flex items-baseline gap-3" aria-label={t.brand}>
            <span className="font-serif text-xl font-semibold tracking-[0.24em]">无痕</span>
            <span className="t-label hidden sm:inline">Unmarked</span>
          </a>

          <nav className="hidden lg:flex items-center gap-10" aria-label="Primary">
            {SECTION_IDS.map((id, i) => (
              <a key={id} href={`#${id}`} onClick={go(id)} className="group relative py-2 text-sm tracking-[0.1em]">
                <span className="t-num mr-1.5 text-[0.65rem] text-muted">0{i + 1}</span>
                {t.nav[id]}
                <span
                  className={cn(
                    "absolute bottom-0 left-0 h-px bg-fg transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active === id ? "w-full" : "w-0 group-hover:w-full",
                  )}
                />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={openSearch}
              className="flex h-10 items-center gap-3 px-3 text-sm text-muted transition-colors duration-300 hover:text-fg"
              aria-label={t.nav.search}
            >
              <SearchIcon size={16} strokeWidth={1.5} />
              <span className="hidden md:inline tracking-[0.08em]">{t.nav.search}</span>
              <kbd className="t-label hidden xl:inline text-[0.65rem]">Ctrl K</kbd>
            </button>
            <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
            <button
              onClick={toggleLang}
              className="t-num h-10 px-3 text-xs text-muted transition-colors duration-300 hover:text-fg"
              aria-label={t.lang.switch}
              title={t.lang.switch}
            >
              <span className={cn(lang === "zh" && "text-fg")}>中</span>
              <span className="mx-1.5 text-line">/</span>
              <span className={cn(lang === "en" && "text-fg")}>EN</span>
            </button>
            <button
              onClick={toggle}
              className="grid h-10 w-10 place-items-center text-muted transition-colors duration-300 hover:text-fg"
              aria-label={t.theme.toggle}
              title={theme === "dark" ? t.theme.light : t.theme.dark}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              onClick={() => setMenu((m) => !m)}
              className="ml-1 h-10 px-2 text-sm tracking-[0.12em] lg:hidden"
              aria-expanded={menu}
              aria-controls="mobile-menu"
            >
              {menu ? t.nav.close : t.nav.menu}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menu && (
          <motion.nav
            id="mobile-menu"
            className="fixed inset-0 z-40 flex flex-col bg-bg pt-24 lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <ul className="wrap flex-1">
              {SECTION_IDS.map((id, i) => (
                <motion.li
                  key={id}
                  className="border-b border-line"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05 + i * 0.05, ease: EASE }}
                >
                  <a href={`#${id}`} onClick={go(id)} className="flex items-baseline gap-5 py-5">
                    <span className="t-label">0{i + 1}</span>
                    <span className="font-serif text-4xl font-semibold tracking-[0.06em]">{t.nav[id]}</span>
                  </a>
                </motion.li>
              ))}
            </ul>
            <p className="wrap t-label pb-8">{t.hero.facts}</p>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}
