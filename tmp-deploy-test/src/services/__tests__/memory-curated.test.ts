import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFactContent, factFingerprint } from '../memory-curated.js';

describe('memory-curated fingerprints', () => {
  it('normalizes whitespace and case', () => {
    assert.equal(
      normalizeFactContent('  I   Work   At   Acme  '),
      'i work at acme'
    );
  });

  it('produces stable fingerprints for equivalent content', () => {
    const a = factFingerprint('I work at Acme');
    const b = factFingerprint('  i   work at acme  ');
    assert.equal(a, b);
  });

  it('differs for different facts', () => {
    assert.notEqual(
      factFingerprint('I work at Acme'),
      factFingerprint('I work at Beta')
    );
  });
});
