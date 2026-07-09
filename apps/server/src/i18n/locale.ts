import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChatMessage } from '../llm/types';

export const APP_LOCALES = ['en', 'ko'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

const localeStorage = new AsyncLocalStorage<AppLocale>();

/** Normalize a browser locale/header value to one of the languages the app supports. */
export function parseAppLocale(value: unknown): AppLocale {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return 'en';
  const base = raw.trim().toLowerCase().split(/[,_-]/)[0];
  return base === 'ko' ? 'ko' : 'en';
}

/** Run one Fastify request with its UI language available to every service/LLM call. */
export function runWithLocale<T>(value: unknown, callback: () => T): T {
  return localeStorage.run(parseAppLocale(value), callback);
}

export function getRequestLocale(): AppLocale {
  return localeStorage.getStore() ?? 'en';
}

export function localeInstruction(locale: AppLocale = getRequestLocale()): string {
  if (locale !== 'ko') return '';
  return (
    `OUTPUT LANGUAGE: Korean (ko). Understand Korean input naturally and write every player-facing ` +
    `piece of dialogue, narration, summary, description, title, note, reason, and other free-form text in natural Korean. ` +
    `Keep proper nouns as authored. Never translate JSON keys, IDs, schema field names, enum values, or other machine-readable tokens. ` +
    `This language rule overrides examples written in English, but it does not change the required output structure.`
  );
}

/** Prepend the request language without mutating the caller's message list. */
export function withLocaleInstruction(messages: ChatMessage[]): ChatMessage[] {
  const instruction = localeInstruction();
  return instruction ? [{ role: 'system', content: instruction }, ...messages] : messages;
}

export function localizedText(en: string, ko: string): string {
  return getRequestLocale() === 'ko' ? ko : en;
}
