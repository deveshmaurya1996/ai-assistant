import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBenignBaileysDecryptError, isBenignBaileysInitQueryError } from '../baileys-log-policy.js';

describe('isBenignBaileysDecryptError', () => {
  it('ignores unrelated log messages', () => {
    assert.equal(
      isBenignBaileysDecryptError(
        { err: { type: 'MessageCounterError', message: 'Key used already or never filled' } },
        'socket closed'
      ),
      false
    );
  });

  it('treats broadcast decrypt failures as benign', () => {
    assert.equal(
      isBenignBaileysDecryptError(
        {
          key: { remoteJid: 'status@broadcast', fromMe: false },
          err: { message: 'No session found to decrypt message' },
        },
        'failed to decrypt message'
      ),
      true
    );
  });

  it('treats fromMe MessageCounterError on LID as benign self-sync', () => {
    assert.equal(
      isBenignBaileysDecryptError(
        {
          key: { remoteJid: '182571157737628@lid', fromMe: true },
          err: {
            type: 'MessageCounterError',
            name: 'MessageCounterError',
            message: 'Key used already or never filled',
          },
        },
        'failed to decrypt message'
      ),
      true
    );
  });

  it('keeps inbound direct chat decrypt failures actionable', () => {
    assert.equal(
      isBenignBaileysDecryptError(
        {
          key: { remoteJid: '919696693168@s.whatsapp.net', fromMe: false },
          err: { type: 'MessageCounterError', message: 'Key used already or never filled' },
        },
        'failed to decrypt message'
      ),
      false
    );
  });
});

describe('isBenignBaileysInitQueryError', () => {
  it('treats init query 408 timeout as benign', () => {
    assert.equal(
      isBenignBaileysInitQueryError(
        { message: 'Timed Out', output: { statusCode: 408 } },
        "unexpected error in 'init queries'"
      ),
      true
    );
  });

  it('ignores other errors', () => {
    assert.equal(
      isBenignBaileysInitQueryError({ message: 'Timed Out' }, 'socket closed'),
      false
    );
  });
});
