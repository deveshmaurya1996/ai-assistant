import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVoiceProfileId } from '../voice-user-settings.js';

describe('resolveVoiceProfileId', () => {
  it('uses personality id as voice profile id', () => {
    assert.equal(resolveVoiceProfileId(undefined, 'friday', {}), 'friday');
    assert.equal(resolveVoiceProfileId(undefined, 'jarvis', {}), 'jarvis');
  });

  it('normalizes legacy profile ids', () => {
    assert.equal(resolveVoiceProfileId('executive-female', undefined, {}), 'friday');
  });

  it('prefers personality over legacy explicit id', () => {
    assert.equal(resolveVoiceProfileId('teacher', 'jarvis', {}), 'jarvis');
  });

  it('falls back to default assistant', () => {
    assert.equal(resolveVoiceProfileId(undefined, undefined, {}), 'assistant');
  });
});
