import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_PERSONALITIES,
  getVoiceProfileForPersonality,
  normalizeVoiceProfileId,
  resolvePersonalityVoiceId,
} from '@ai-assistant/types';

describe('assistant personality voice', () => {
  it('every personality exposes a voice profile with the same id', () => {
    for (const personality of ASSISTANT_PERSONALITIES) {
      const profile = getVoiceProfileForPersonality(personality.id);
      assert.equal(profile.id, personality.id);
      assert.equal(profile.personalityId, personality.id);
      assert.equal(profile.label, personality.name);
      assert.equal(profile.voiceId, personality.voice);
    }
  });

  it('maps legacy voice profile ids to personality ids', () => {
    assert.equal(normalizeVoiceProfileId('friendly-default'), 'assistant');
    assert.equal(normalizeVoiceProfileId('executive-female'), 'friday');
    assert.equal(normalizeVoiceProfileId('coach'), 'nova');
  });

  it('resolves TTS voice slug from personality', () => {
    const personality = ASSISTANT_PERSONALITIES[0]!;
    assert.equal(resolvePersonalityVoiceId(personality), 'en_US-lessac-medium');
    assert.equal(
      resolvePersonalityVoiceId(personality, {
        PIPER_VOICE_FEMALE_PROFESSIONAL: 'custom-female-professional',
      }),
      'custom-female-professional'
    );
  });
});
