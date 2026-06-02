
import {
  apiBase,
  chatWithAttachment,
  loadAttachmentFromPath,
  signUpSession,
  uploadFile,
} from './lib/verify-attachment.mjs';

const IMAGE_ARG = process.argv.indexOf('--image');
const imagePath = IMAGE_ARG >= 0 ? process.argv[IMAGE_ARG + 1] : null;
const isImageMode = Boolean(imagePath);

const MARKER = `ATTACH_VERIFY_${Date.now()}`;

async function runTextMode({ sessionToken, cookie }) {
  const attachment = await uploadFile({
    sessionToken,
    cookie,
    buffer: Buffer.from(`Project codename: ${MARKER}. Revenue target is 42 million.`),
    filename: 'verify-attachment.txt',
    mimeType: 'text/plain',
  });

  console.log('[verify-attachment] uploaded text file', attachment.id);

  const { reply, modelUsed } = await chatWithAttachment({
    sessionToken,
    cookie,
    attachment,
    prompt: 'What is the project codename in the attached file? Reply with the exact codename only.',
    validate: (text) => {
      if (!text.includes(MARKER)) {
        throw new Error(`Reply missing marker ${MARKER}: ${text.slice(0, 200)}`);
      }
    },
  });

  console.log('[verify-attachment] reply:', reply.slice(0, 200));
  console.log('[verify-attachment] model:', modelUsed);
}

async function runImageMode({ sessionToken, cookie }) {
  if (!imagePath) throw new Error('--image requires a file path');

  const { buffer, filename, mimeType } = loadAttachmentFromPath(imagePath);
  const attachment = await uploadFile({
    sessionToken,
    cookie,
    buffer,
    filename,
    mimeType,
  });

  console.log('[verify-attachment] uploaded image', attachment.id, attachment.mimeType);

  const { reply, modelUsed, modelLabel } = await chatWithAttachment({
    sessionToken,
    cookie,
    attachment,
    prompt:
      'Describe what you see in this image. Include any visible brand names or text.',
    validate: (text) => {
      const generic =
        /cannot see|can't see|don't have access|unable to view|no image|not able to analyze|requires.*API_KEY|Attachment analysis requires/i;
      if (generic.test(text)) {
        throw new Error('Reply indicates image was not analyzed');
      }
      if (text.length < 40) {
        throw new Error(`Reply too short (${text.length} chars)`);
      }
    },
  });

  console.log('[verify-attachment] reply:', reply.slice(0, 400));
  console.log('[verify-attachment] model:', modelUsed, modelLabel);
}

async function main() {
  console.log('[verify-attachment] api:', apiBase());
  console.log('[verify-attachment] mode:', isImageMode ? `image (${imagePath})` : 'text');

  const session = await signUpSession();
  if (isImageMode) {
    await runImageMode(session);
  } else {
    await runTextMode(session);
  }

  console.log('[verify-attachment] PASS');
}

main().catch((err) => {
  console.error('[verify-attachment] FAIL', err.message ?? err);
  process.exit(1);
});
