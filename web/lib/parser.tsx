"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode, type RefObject,
} from "react";
import { ParseError, parseShare, type ParseErrorCode, type ParseResult } from "./parse";

export interface HistoryEntry extends ParseResult { id: string; savedAt: number }

const HISTORY_KEY = "unmarked:history";
const HISTORY_MAX = 40;

type Status = "idle" | "loading" | "error" | "done";

interface ParserValue {
  input: string;
  setInput: (v: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  status: Status;
  error: { code: ParseErrorCode; detail?: string } | null;
  result: ParseResult | null;
  history: HistoryEntry[];
  parse: (text?: string) => Promise<void>;
  clearHistory: () => void;
  focusInput: () => void;
}

const ParserContext = createContext<ParserValue | null>(null);

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function ParserProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ParserValue["error"]>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch { /* 忽略损坏的本地数据 */ }
  }, []);

  const persist = (list: HistoryEntry[]) => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* 存储已满 */ }
  };

  const parse = useCallback(async (text?: string) => {
    const value = text ?? input;
    if (text !== undefined) setInput(text);
    const id = ++reqId.current;
    setStatus("loading");
    setError(null);
    try {
      const res = await parseShare(value);
      if (id !== reqId.current) return;
      setResult(res);
      setStatus("done");
      setHistory((prev) => {
        const entry: HistoryEntry = { ...res, id: `${Date.now()}`, savedAt: Date.now() };
        const next = [entry, ...prev.filter((h) => h.source !== res.source)].slice(0, HISTORY_MAX);
        persist(next);
        return next;
      });
      requestAnimationFrame(() => scrollToId("result"));
    } catch (e) {
      if (id !== reqId.current) return;
      const err = e instanceof ParseError ? e : new ParseError("network");
      setError({ code: err.code, detail: err.detail });
      setStatus("error");
    }
  }, [input]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    persist([]);
  }, []);

  const focusInput = useCallback(() => {
    scrollToId("parse");
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 450);
  }, []);

  const value = useMemo<ParserValue>(
    () => ({ input, setInput, inputRef, status, error, result, history, parse, clearHistory, focusInput }),
    [input, status, error, result, history, parse, clearHistory, focusInput],
  );

  return <ParserContext.Provider value={value}>{children}</ParserContext.Provider>;
}

export function useParser() {
  const ctx = useContext(ParserContext);
  if (!ctx) throw new Error("useParser must be used within ParserProvider");
  return ctx;
}
