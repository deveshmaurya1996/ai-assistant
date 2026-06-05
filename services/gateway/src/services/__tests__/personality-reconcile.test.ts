import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDisplayName, resolveAssistantContext } from '@ai-assistant/types';

describe('reconcileDisplayName', () => {
  it('uses preset name when display name is another preset default', () => {
    assert.equal(reconcileDisplayName('friday', 'Jarvis'), 'Friday');
    assert.equal(reconcileDisplayName('jarvis', 'Friday'), 'Jarvis');
  });

  it('ignores custom names for named personality presets', () => {
    assert.equal(reconcileDisplayName('friday', 'Alex'), 'Friday');
    assert.equal(reconcileDisplayName('jarvis', 'Bob'), 'Jarvis');
  });

  it('allows custom names for the default assistant preset only', () => {
    assert.equal(reconcileDisplayName('assistant', 'Alex'), 'Alex');
    assert.equal(reconcileDisplayName('assistant', 'Friday'), 'Assistant');
  });
});

describe('resolveAssistantContext', () => {
  it('builds Friday identity for friday preset', () => {
    const ctx = resolveAssistantContext('friday', 'Friday');
    assert.equal(ctx.displayName, 'Friday');
    assert.match(ctx.systemPrompt, /Your name is Friday/i);
    assert.match(ctx.systemPrompt, /friendly and professional/i);
  });
});
