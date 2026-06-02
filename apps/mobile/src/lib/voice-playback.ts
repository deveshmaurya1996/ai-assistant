import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { apiClient } from '@/lib/api-client';
import { drainCompleteSentences } from '@/lib/sentence-tts';

let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;
let speechAbortFlag = false;

async function bufferToPlayableUri(buffer: ArrayBuffer): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = new Blob([buffer], { type: 'audio/mpeg' });
    return URL.createObjectURL(blob);
  }

  const file = new File(Paths.cache, `tts-${Date.now()}.mp3`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(new Uint8Array(buffer));
  return file.uri;
}

async function releaseActivePlayer(): Promise<void> {
  if (!activePlayer) return;
  try {
    activePlayer.pause();
    activePlayer.remove();
  } catch {
    /* player may already be released */
  }
  activePlayer = null;
}

export async function stopSpeechPlayback(): Promise<void> {
  await releaseActivePlayer();
}

export async function abortSpeechPlayback(): Promise<void> {
  speechAbortFlag = true;
  await releaseActivePlayer();
}

export function isSpeechAborted(): boolean {
  return speechAbortFlag;
}

export function resetSpeechAbort(): void {
  speechAbortFlag = false;
}

async function playBuffer(buffer: ArrayBuffer): Promise<void> {
  if (speechAbortFlag) return;

  const uri = await bufferToPlayableUri(buffer);
  const player = createAudioPlayer(uri);
  activePlayer = player;

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      try {
        player.remove();
      } catch {
        /* ignore */
      }
      if (activePlayer === player) {
        activePlayer = null;
      }
      if (Platform.OS === 'web' && uri.startsWith('blob:')) {
        URL.revokeObjectURL(uri);
      }
      resolve();
    };

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (speechAbortFlag) {
        subscription.remove();
        try {
          player.pause();
          player.remove();
        } catch {
          /* ignore */
        }
        if (activePlayer === player) activePlayer = null;
        resolve();
        return;
      }
      if (status.didJustFinish) {
        subscription.remove();
        finish();
      }
    });

    try {
      player.play();
    } catch (err) {
      subscription.remove();
      reject(err);
    }
  });
}

export async function speakText(
  text: string,
  onFinished?: () => void,
  voice?: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    onFinished?.();
    return;
  }

  resetSpeechAbort();
  await releaseActivePlayer();

  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
  });

  const buffer = await apiClient.speakVoice(trimmed, voice);
  if (speechAbortFlag) {
    onFinished?.();
    return;
  }
  await playBuffer(buffer);
  onFinished?.();
}

/** Queue TTS by sentence as assistant text streams in. */
export class SentenceTtsQueue {
  private buffer = '';
  private chain: Promise<void> = Promise.resolve();
  private speaking = false;
  private voice?: string;

  constructor(voice?: string) {
    this.voice = voice;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  pushChunk(chunk: string): void {
    this.buffer += chunk;
    const { sentences, remainder } = drainCompleteSentences(this.buffer);
    this.buffer = remainder;
    for (const sentence of sentences) {
      this.enqueue(sentence);
    }
  }

  private enqueue(sentence: string): void {
    this.chain = this.chain.then(async () => {
      if (speechAbortFlag) return;
      this.speaking = true;
      try {
        await speakText(sentence, undefined, this.voice);
      } finally {
        this.speaking = false;
      }
    });
  }

  async flush(): Promise<void> {
    const tail = this.buffer.trim();
    this.buffer = '';
    if (tail.length > 0) {
      this.enqueue(tail);
    }
    await this.chain;
  }

  async abort(): Promise<void> {
    await abortSpeechPlayback();
    resetSpeechAbort();
    this.buffer = '';
    this.chain = Promise.resolve();
    this.speaking = false;
  }
}
