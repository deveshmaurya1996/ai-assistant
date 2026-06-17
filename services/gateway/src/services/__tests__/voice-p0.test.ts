import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVoiceSessionContext,
  trimVoiceChatHistory,
  voiceSummaryPrefix,
} from '../voice-summary.service.js';
import { resolveVoiceRoomId } from '../voice-session.service.js';

describe('voiceSummaryPrefix', () => {
  it('returns empty when no summary', () => {
    assert.equal(voiceSummaryPrefix(null), '');
  });

  it('prefixes rolling summary', () => {
    const prefix = voiceSummaryPrefix({
      rollingSummary: 'User asked about meetings.',
      summarizedThroughMessageId: 'm1',
      turnCount: 3,
    });
    assert.match(prefix, /Voice session summary/);
    assert.match(prefix, /meetings/);
  });
});

describe('trimVoiceChatHistory', () => {
  it('keeps last N turns', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    const trimmed = trimVoiceChatHistory(history, 4);
    assert.equal(trimmed.length, 4);
    assert.equal(trimmed[0]?.content, 'm8');
  });
});

describe('parseVoiceSessionContext', () => {
  it('parses nested voice context', () => {
    const parsed = parseVoiceSessionContext({
      voice: {
        rollingSummary: 'hello',
        summarizedThroughMessageId: 'abc',
        turnCount: 2,
      },
    });
    assert.equal(parsed?.rollingSummary, 'hello');
    assert.equal(parsed?.turnCount, 2);
  });
});

describe('resolveVoiceRoomId', () => {
  it('prefixes chat session id', () => {
    assert.equal(resolveVoiceRoomId('sess-1'), 'voice-sess-1');
  });
});
