import { AVAILABILITY_REASONS, UNAVAILABLE_CHANCE, DEFAULT_PLAYER_ID, isMemorialized } from '@dsim/shared';
import { charactersRepo, relationshipsRepo, worldStatesRepo } from '../db/repositories';
import { hashFloat } from '../lib/seeded-random';
import { getRequestLocale } from '../i18n/locale';

/**
 * Per-(world, day) character availability ("Do Not Disturb"). Deterministic —
 * derived from a hash of (worldId, day, characterId) so it's stable for the day
 * with no persistence. A GUARD guarantees at least one character in the world is
 * always available, so the player can always date someone.
 */

export interface Availability {
  characterId: string;
  available: boolean;
  reason: string | null;
}

function reasonFor(worldId: string, day: number, characterId: string): string {
  const idx = Math.floor(hashFloat(`${worldId}|${day}|${characterId}|reason`) * AVAILABILITY_REASONS.length);
  const safeIndex = Math.min(idx, AVAILABILITY_REASONS.length - 1);
  if (getRequestLocale() === 'ko') {
    return [
      '오늘은 일에 파묻혀 있습니다',
      '내일까지 다른 지역에 있습니다',
      '혼자 재충전할 시간이 필요합니다',
      '가족 일로 바쁩니다',
      '몸 상태가 좋지 않습니다',
      '오늘 일정이 꽉 차 있습니다',
      '개인적인 일을 처리하느라 연락이 어렵습니다',
      '오늘은 조용히 혼자 보내고 싶어 합니다',
    ][safeIndex]!;
  }
  return AVAILABILITY_REASONS[safeIndex]!;
}

/** A memorialized character is permanently gone — never available. */
function isMemorializedChar(characterId: string): boolean {
  const rel = relationshipsRepo.getByCharacter(characterId, DEFAULT_PLAYER_ID);
  return rel ? isMemorialized(rel) : false;
}

/** Availability for every character in a world on a given day (with the guard). */
export function getWorldAvailability(worldId: string, day: number): Availability[] {
  const characters = charactersRepo.listByWorld(worldId);
  if (characters.length === 0) return [];

  const rolls = characters.map((c) => ({ id: c.id, roll: hashFloat(`${worldId}|${day}|${c.id}`), memorial: isMemorializedChar(c.id) }));
  const result: Availability[] = rolls.map(({ id, roll, memorial }) =>
    memorial
      ? {
          characterId: id,
          available: false,
          reason: getRequestLocale() === 'ko' ? '더 이상 이 세계에 없습니다' : 'is no longer with us',
        }
      : roll < UNAVAILABLE_CHANCE
        ? { characterId: id, available: false, reason: reasonFor(worldId, day, id) }
        : { characterId: id, available: true, reason: null },
  );

  // Guard: if nobody is available, free up the LIVING character closest to
  // available (highest roll). Memorialized characters are never force-freed.
  if (!result.some((a) => a.available)) {
    const living = rolls.filter((r) => !r.memorial);
    if (living.length > 0) {
      let best = living[0]!;
      for (const r of living) if (r.roll > best.roll) best = r;
      const idx = result.findIndex((a) => a.characterId === best.id);
      if (idx >= 0) result[idx] = { characterId: best.id, available: true, reason: null };
    }
  }
  return result;
}

/** Availability for one character (single rehash). Unknown characters are available. */
export function getCharacterAvailability(worldId: string, day: number, characterId: string): Availability {
  return (
    getWorldAvailability(worldId, day).find((a) => a.characterId === characterId) ?? {
      characterId,
      available: true,
      reason: null,
    }
  );
}

/** Whether a specific character is available on a given day in a world. */
export function isCharacterAvailable(worldId: string, day: number, characterId: string): boolean {
  return getCharacterAvailability(worldId, day, characterId).available;
}

export function availabilityReason(worldId: string, day: number, characterId: string): string | null {
  return getCharacterAvailability(worldId, day, characterId).reason;
}

/**
 * Current-day availability for a single character, resolved against that
 * character's OWN world clock. A world-less or clock-less character is treated as
 * available — there's no day for them to be busy on.
 */
export function currentAvailabilityFor(character: { id: string; worldId: string | null }): Availability {
  if (!character.worldId) return { characterId: character.id, available: true, reason: null };
  const state = worldStatesRepo.get(character.worldId);
  if (!state) return { characterId: character.id, available: true, reason: null };
  return getCharacterAvailability(character.worldId, state.day, character.id);
}

/**
 * Current-day availability for many characters at once, grouped by world so each
 * world is hashed a single time (avoids the O(n^2) of per-character rehashing).
 * Returns a Map keyed by characterId.
 */
export function currentAvailabilityMap(
  characters: Array<{ id: string; worldId: string | null }>,
): Map<string, Availability> {
  const out = new Map<string, Availability>();
  const byWorld = new Map<string, string[]>();
  for (const c of characters) {
    if (!c.worldId) {
      out.set(c.id, { characterId: c.id, available: true, reason: null });
      continue;
    }
    const ids = byWorld.get(c.worldId);
    if (ids) ids.push(c.id);
    else byWorld.set(c.worldId, [c.id]);
  }
  for (const [worldId, ids] of byWorld) {
    const state = worldStatesRepo.get(worldId);
    if (!state) {
      for (const id of ids) out.set(id, { characterId: id, available: true, reason: null });
      continue;
    }
    const world = new Map(getWorldAvailability(worldId, state.day).map((a) => [a.characterId, a]));
    for (const id of ids) out.set(id, world.get(id) ?? { characterId: id, available: true, reason: null });
  }
  return out;
}
