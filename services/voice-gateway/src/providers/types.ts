export type SpeechStreamOpts = {
  language?: string;
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (error: Error) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
};

export interface SpeechStream {
  pushAudio(frame: Buffer): void;
  end(): void;
  cancel(): void;
  close?(): Promise<void>;
}

export interface SpeechProvider {
  readonly id: string;
  startStream(opts: SpeechStreamOpts): SpeechStream;
}

export interface STTProvider extends SpeechProvider {}

export type TTSOpts = {
  voiceId: string;
  speakingRate?: number;
  signal?: AbortSignal;
};

export type AudioFrame = Buffer;

export interface TTSProvider {
  readonly id: string;
  synthesizeStream(text: string, opts: TTSOpts): AsyncIterable<AudioFrame>;
  interrupt(): void;
}
