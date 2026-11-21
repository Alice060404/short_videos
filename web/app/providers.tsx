"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { SearchProvider } from "@/components/Search";
import { I18nProvider } from "@/lib/i18n";
import { ParserProvider } from "@/lib/parser";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <I18nProvider>
          <ParserProvider>
            <SearchProvider>{children}</SearchProvider>
          </ParserProvider>
        </I18nProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
