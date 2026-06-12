import type { ChatAttachmentRef } from '@ai-assistant/types';
import { prisma } from '@ai-assistant/database';
import { getSessionFileContext } from './file-registry.service';

const GREETING_ONLY = /^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|bye)[\s!.?]*$/i;

export function queryReferencesSessionFiles(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const signals = [
    'page ',
    'uploaded',
    'my pdf',
    'my document',
    'attached file',
    'attached pdf',
    'the contract',
    'my file',
    'that file',
    'this file',
    'the file',
    'check the file',
    'look at the file',
    'read the file',
    'see the file',
    'from the file',
    'in the file',
    'the document',
    'in the pdf',
    'in the document',
    'summarize',
    'summary',
    'what did page',
    'what does page',
  ];
  return signals.some((s) => q.includes(s));
}

function isSessionFileAutoHydrateEnabled(): boolean {
  const raw = (process.env.SESSION_FILE_AUTO_HYDRATE ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

export async function shouldHydrateSessionFiles(
  sessionId: string,
  query: string,
  hasNewAttachments: boolean
): Promise<boolean> {
  if (hasNewAttachments) return true;

  const ctx = await getSessionFileContext(sessionId);
  const fileIds = ctx.lastReferencedFileIds ?? [];
  if (fileIds.length === 0) return false;

  const q = query.trim();
  if (!q) return false;
  if (GREETING_ONLY.test(q)) return false;

  if (queryReferencesSessionFiles(q)) return true;

  if (isSessionFileAutoHydrateEnabled()) {
    return true;
  }

  return false;
}

type MessageRow = {
  role: string;
  content: string;
  metadata: unknown;
};

export async function buildSessionWorkingContext(
  userId: string,
  messages: MessageRow[],
  maxAttachmentTurns = 5
): Promise<string> {
  const parts: string[] = [];
  let attachmentTurns = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (attachmentTurns >= maxAttachmentTurns) break;
    const row = messages[i];
    if (row.role !== 'USER') continue;

    const meta = row.metadata as { attachments?: ChatAttachmentRef[] } | null;
    const refs = meta?.attachments;
    if (!refs?.length) continue;

    attachmentTurns += 1;
    for (const ref of refs) {
      const asset = await prisma.fileAsset.findFirst({
        where: { id: ref.id, userId },
        select: { filename: true, summary: true, mimeType: true, status: true },
      });
      if (!asset) {
        parts.push(`- ${ref.filename} (file id ${ref.id})`);
        continue;
      }
      const summary = asset.summary?.trim();
      const statusNote =
        asset.status !== 'ready' ? ` [indexing: ${asset.status}]` : '';
      if (summary) {
        parts.push(`- ${asset.filename}${statusNote}: ${summary.slice(0, 400)}`);
      } else {
        parts.push(`- ${asset.filename} (${asset.mimeType})${statusNote}`);
      }
    }
  }

  if (!parts.length) return '';
  return 'Files shared in this chat:\n' + parts.join('\n');
}
