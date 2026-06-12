import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldExtractFacts } from '../memory-extract-policy.js';

describe('shouldExtractFacts', () => {
  it('skips greeting-only user messages', () => {
    assert.equal(shouldExtractFacts('hello', 'Hi there! How can I help?'), false);
    assert.equal(shouldExtractFacts('thanks!', 'You are welcome!'), false);
  });

  it('runs for long personal user messages', () => {
    const user =
      'I am a senior software engineer at Acme Corp in Austin and I prefer TypeScript for backend work.';
    assert.equal(shouldExtractFacts(user, 'Thanks for sharing that.'), true);
  });

  it('runs when user mentions remember or preferences', () => {
    assert.equal(
      shouldExtractFacts('Remember my timezone is US Central', 'Got it.'),
      true
    );
  });

  it('runs when assistant reply is profile-like and user message is substantive', () => {
    assert.equal(
      shouldExtractFacts(
        'I work at Acme as a backend dev',
        "I'll remember that you work at Acme as a backend developer."
      ),
      true
    );
  });

  it('skips short small talk', () => {
    assert.equal(shouldExtractFacts('nice', 'Glad you think so!'), false);
  });
});
