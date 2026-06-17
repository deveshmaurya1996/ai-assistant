import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getVoiceProfileForPersonality } from '@ai-assistant/types';
import { resolveProviders } from '../providers/registry.js';
import { VoiceAnalyticsCollector } from '../analytics.js';
import { buildWelcomePhrase } from '../speak-phrase.js';

describe('buildWelcomePhrase', () => {
  it('includes assistant name', () => {
    const phrase = buildWelcomePhrase('friday');
    assert.match(phrase, /Friday/);
  });
});

describe('resolveProviders', () => {
  it('resolves faster-whisper + piper from default profile', () => {
    const profile = getVoiceProfileForPersonality('assistant');
    assert.ok(profile);
    const { stt, tts } = resolveProviders(profile);
    assert.equal(stt.id, 'faster-whisper');
    assert.equal(tts.id, 'piper');
  });
});

describe('VoiceAnalyticsCollector', () => {
  it('builds analytics with timings', () => {
    const collector = new VoiceAnalyticsCollector();
    collector.markSpeechEnd();
    collector.markGatewayFirstByte();
    collector.markFirstToken();
    collector.markTtsFirstByte();
    collector.setDoneTimings({ plan_tools_ms: 120, tool_gmail_ms: 80 });
    const built = collector.build('turn-1', 50);
    assert.equal(built.turnId, 'turn-1');
    assert.equal(built.sttLatencyMs, 50);
    assert.equal(built.plannerLatencyMs, 120);
    assert.ok(built.totalLatencyMs >= 0);
  });
});
