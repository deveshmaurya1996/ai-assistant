import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryReferencesSessionFiles } from '../session-context.service.js';

describe('queryReferencesSessionFiles', () => {
  it('matches check the file', () => {
    assert.equal(queryReferencesSessionFiles('can you check the file?'), true);
  });

  it('does not match unrelated text', () => {
    assert.equal(queryReferencesSessionFiles('what is the weather'), false);
  });
});
