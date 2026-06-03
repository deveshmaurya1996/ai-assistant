import { isExplicitRememberIntent } from './memory-explicit';

const GREETING_ONLY =
  /^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|cool|great|bye|goodbye|good morning|good night)[\s!.?]*$/i;

const MEMORY_SIGNALS = [
  'remember',
  'recall',
  'about me',
  'my preference',
  'my project',
  'my name',
  'my job',
  'my company',
  'i work at',
  "i'm a ",
  'i am a ',
  'i live in',
  'call me ',
  'prefer ',
  'preference',
];

const PROFILE_REPLY =
  /\b(?:your name is|you work at|you prefer|you live in|you mentioned|i'll remember|noted that you|company is|role is|developer|engineer)\b/i;

const MIN_EXTRACT_USER_LENGTH = 80;

export function shouldExtractFacts(userText: string, assistantText: string): boolean {
  const user = (userText ?? '').trim();
  const assistant = (assistantText ?? '').trim();

  if (!user && !assistant) return false;
  if (GREETING_ONLY.test(user)) return false;
  if (isExplicitRememberIntent(user)) return true;

  const lower = user.toLowerCase();
  if (MEMORY_SIGNALS.some((signal) => lower.includes(signal))) return true;
  if (user.length >= MIN_EXTRACT_USER_LENGTH) return true;
  if (PROFILE_REPLY.test(assistant) && user.length >= 20) return true;

  return false;
}
