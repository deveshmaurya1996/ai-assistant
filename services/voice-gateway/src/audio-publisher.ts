import {
  AudioFrame,
  AudioResampler,
  AudioResamplerQuality,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  type Room,
} from '@livekit/rtc-node';

const TTS_INPUT_SAMPLE_RATE = Number(process.env.VOICE_TTS_INPUT_SAMPLE_RATE || 22_050);
const TTS_OUTPUT_SAMPLE_RATE = 48_000;
const FRAME_DURATION_MS = 10;
const SAMPLES_PER_FRAME = Math.floor(TTS_OUTPUT_SAMPLE_RATE * (FRAME_DURATION_MS / 1000));

export class AgentAudioPublisher {
  private readonly source: AudioSource;
  private readonly track: LocalAudioTrack;
  private readonly resampler: AudioResampler;
  private published = false;
  private utteranceChunks = 0;
  private pendingSamples: number[] = [];
  private playoutDeadlineMs = 0;

  constructor(private readonly room: Room) {
    this.source = new AudioSource(TTS_OUTPUT_SAMPLE_RATE, 1);
    this.track = LocalAudioTrack.createAudioTrack('agent-voice', this.source);
    this.resampler = new AudioResampler(
      TTS_INPUT_SAMPLE_RATE,
      TTS_OUTPUT_SAMPLE_RATE,
      1,
      AudioResamplerQuality.HIGH
    );
  }

  isPlaying(): boolean {
    return this.source.queuedDuration > 30 || this.pendingSamples.length > 0;
  }

  async ensurePublished(): Promise<void> {
    if (this.published) return;
    const participant = this.room.localParticipant;
    if (!participant) return;
    await participant.publishTrack(
      this.track,
      new TrackPublishOptions({ source: TrackSource.SOURCE_UNKNOWN })
    );
    this.published = true;
  }

  private async emitFrame(samples: Int16Array): Promise<void> {
    if (!samples.length) return;

    const now = performance.now();
    if (this.playoutDeadlineMs <= 0) {
      this.playoutDeadlineMs = now;
    }
    if (now < this.playoutDeadlineMs) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.playoutDeadlineMs - now);
      });
    }

    const frameDurationMs = (samples.length / TTS_OUTPUT_SAMPLE_RATE) * 1000;
    const frame = new AudioFrame(samples, TTS_OUTPUT_SAMPLE_RATE, 1, samples.length);
    await this.source.captureFrame(frame);
    this.playoutDeadlineMs += frameDurationMs;
    this.utteranceChunks += 1;
  }

  private async enqueueResampledSamples(samples: Int16Array): Promise<void> {
    for (let i = 0; i < samples.length; i++) {
      this.pendingSamples.push(samples[i]!);
    }

    while (this.pendingSamples.length >= SAMPLES_PER_FRAME) {
      const frameSamples = Int16Array.from(this.pendingSamples.splice(0, SAMPLES_PER_FRAME));
      await this.emitFrame(frameSamples);
    }
  }

  async publishPcm(chunk: Buffer): Promise<void> {
    if (!chunk.length) return;
    await this.ensurePublished();
    const samplesPerChannel = Math.floor(chunk.length / 2);
    if (samplesPerChannel <= 0) return;
    const int16 = new Int16Array(
      chunk.buffer,
      chunk.byteOffset,
      Math.floor(chunk.byteLength / 2)
    );
    const frame = new AudioFrame(int16, TTS_INPUT_SAMPLE_RATE, 1, samplesPerChannel);
    const resampledFrames = this.resampler.push(frame);
    for (const outFrame of resampledFrames) {
      await this.enqueueResampledSamples(outFrame.data);
    }
  }

async endUtterance(): Promise<void> {
  const tailFrames = this.resampler.flush();

  for (const outFrame of tailFrames) {
    await this.enqueueResampledSamples(outFrame.data);
  }

  if (this.pendingSamples.length > 0) {
    const frameSamples = Int16Array.from(this.pendingSamples);
    this.pendingSamples = [];
    await this.emitFrame(frameSamples);
  }

  try {
    await this.source.waitForPlayout();
  } catch {
    /* ignore */
  }

  this.utteranceChunks = 0;
  this.playoutDeadlineMs = 0;
}

  interrupt(): void {
    try {
      this.resampler.flush();
    } catch {
      /* ignore */
    }

    this.pendingSamples = [];
    this.playoutDeadlineMs = 0;
    this.utteranceChunks = 0;

    try {
      this.source.clearQueue();
    } catch {
      /* ignore */
    }
  }
}
