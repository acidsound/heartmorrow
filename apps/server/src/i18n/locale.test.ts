import { describe, expect, it } from 'vitest';
import {
  getRequestLocale,
  localeInstruction,
  parseAppLocale,
  runWithLocale,
  withLocaleInstruction,
} from './locale';

describe('request locale', () => {
  it('normalizes supported Korean locale variants and falls back to English', () => {
    expect(parseAppLocale('ko-KR')).toBe('ko');
    expect(parseAppLocale('ko_KR')).toBe('ko');
    expect(parseAppLocale('en-US')).toBe('en');
    expect(parseAppLocale('fr-FR')).toBe('en');
  });

  it('keeps concurrent async request languages isolated', async () => {
    const [ko, en] = await Promise.all([
      runWithLocale('ko-KR', async () => {
        await Promise.resolve();
        return getRequestLocale();
      }),
      runWithLocale('en-US', async () => {
        await Promise.resolve();
        return getRequestLocale();
      }),
    ]);
    expect({ ko, en }).toEqual({ ko: 'ko', en: 'en' });
  });

  it('adds a Korean output contract without mutating the original messages', () => {
    const messages = [{ role: 'user' as const, content: '안녕하세요' }];
    const localized = runWithLocale('ko', () => withLocaleInstruction(messages));

    expect(localized).not.toBe(messages);
    expect(localized).toHaveLength(2);
    expect(localized[0]?.role).toBe('system');
    expect(localized[0]?.content).toContain('Korean (ko)');
    expect(localized[1]).toEqual(messages[0]);
    expect(messages).toHaveLength(1);
    expect(runWithLocale('en', () => localeInstruction())).toBe('');
  });
});
