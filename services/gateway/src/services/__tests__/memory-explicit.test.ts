import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExplicitRememberIntent,
  parseExplicitRememberContent,
} from '../memory-explicit.js';

describe('parseExplicitRememberContent', () => {
  it('parses Remember: payload', () => {
    assert.equal(
      parseExplicitRememberContent('Remember: I work at Acme as a developer'),
      'I work at Acme as a developer'
    );
  });

  it('parses remember that', () => {
    assert.equal(
      parseExplicitRememberContent('remember that my company is Acme'),
      'my company is Acme'
    );
  });

  it('returns null for retrieval-only questions', () => {
    assert.equal(parseExplicitRememberContent('do you remember my name?'), null);
    assert.equal(parseExplicitRememberContent('What do you remember about me?'), null);
  });

  it('returns null for filler-only payload', () => {
    assert.equal(parseExplicitRememberContent('Remember: it'), null);
  });
});

describe('isExplicitRememberIntent', () => {
  it('detects save cues', () => {
    assert.equal(isExplicitRememberIntent('Please save this for later'), true);
    assert.equal(isExplicitRememberIntent('remember my resume details'), true);
  });

  it('rejects retrieval-only', () => {
    assert.equal(isExplicitRememberIntent('do you remember what we discussed?'), false);
  });
});
