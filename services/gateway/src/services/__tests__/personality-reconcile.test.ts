import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDisplayName, resolveAssistantContext } from '@ai-assistant/types';

describe('reconcileDisplayName', () => {
  it('uses preset name when display name is another preset default', () => {
    assert.equal(reconcileDisplayName('friday', 'Jarvis'), 'Friday');
    assert.equal(reconcileDisplayName('jarvis', 'Friday'), 'Jarvis');
  });

  it('keeps custom names that are not preset defaults', () => {
    assert.equal(reconcileDisplayName('friday', 'Alex'), 'Alex');
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
