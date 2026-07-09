import { describe, expect, it } from 'vitest';
import enCommon from './locales/en/common.json';
import enPages from './locales/en/pages.json';
import enPhone from './locales/en/phone.json';
import enSettings from './locales/en/settings.json';
import koCommon from './locales/ko/common.json';
import koPages from './locales/ko/pages.json';
import koPhone from './locales/ko/phone.json';
import koSettings from './locales/ko/settings.json';

const ICU_PLURAL_RE = /\{([A-Za-z][A-Za-z0-9_]*), plural, one \{((?:[^{}]|\{[A-Za-z][A-Za-z0-9_]*\})*)\} other \{((?:[^{}]|\{[A-Za-z][A-Za-z0-9_]*\})*)\}\}/g;

function flatten(value: unknown, path: string[] = [], out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') out.set(path.join('.'), value);
  else if (Array.isArray(value)) value.forEach((item, index) => flatten(item, [...path, String(index)], out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flatten(item, [...path, key], out);
  }
  return out;
}

function contract(text: string) {
  const plurals: Array<{ variable: string; pounds: number }> = [];
  const withoutPlurals = text.replace(ICU_PLURAL_RE, (_match, variable: string, one: string, other: string) => {
    plurals.push({ variable, pounds: (one.match(/#/g) ?? []).length + (other.match(/#/g) ?? []).length });
    return `${one} ${other}`;
  });
  const variables = [...new Set(
    [...withoutPlurals.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!),
  )].sort();
  const tags = [...text.matchAll(/<\/?\d+>/g)].map((match) => match[0]).sort();
  return { variables, plurals, tags };
}

const catalogs = [
  ['common', enCommon, koCommon],
  ['settings', enSettings, koSettings],
  ['phone', enPhone, koPhone],
  ['pages', enPages, koPages],
] as const;

describe('Korean locale catalogs', () => {
  for (const [namespace, english, korean] of catalogs) {
    it(`${namespace} mirrors every English key and interpolation contract`, () => {
      const en = flatten(english);
      const ko = flatten(korean);
      expect([...ko.keys()].sort()).toEqual([...en.keys()].sort());
      for (const [key, source] of en) {
        expect(contract(ko.get(key) ?? ''), `${namespace}:${key}`).toEqual(contract(source));
      }
    });
  }
});
