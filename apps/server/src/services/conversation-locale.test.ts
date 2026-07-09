import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runWithLocale } from '../i18n/locale';
import { setAdapterOverride } from '../llm/provider';
import { ScriptedAdapter, resetDb, seedWorldAndCharacter } from '../test/helpers';
import { addPlayerMessage, createSession, generateReply } from './conversation-service';

describe('localized conversation generation', () => {
  beforeEach(() => resetDb());
  afterEach(() => setAdapterOverride(null));

  it('sends Korean player input with an explicit Korean reply contract', async () => {
    const { character } = seedWorldAndCharacter();
    const session = createSession({ characterId: character.id, mode: 'chat', locationId: null });
    addPlayerMessage(session.id, '안녕, 오늘 하루는 어땠어?');
    const adapter = new ScriptedAdapter(['오늘은 꽤 괜찮았어. 너는?']);
    setAdapterOverride(adapter);

    const reply = await runWithLocale('ko-KR', () => generateReply(session.id));

    expect(reply.text).toBe('오늘은 꽤 괜찮았어. 너는?');
    const messages = adapter.seenRequests[0]?.messages ?? [];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Korean (ko)');
    expect(messages.some((message) => message.role === 'user' && message.content === '안녕, 오늘 하루는 어땠어?')).toBe(true);
  });
});
