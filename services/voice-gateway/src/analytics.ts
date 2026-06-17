import type { VoiceTurnAnalytics } from '@ai-assistant/types';

export class VoiceAnalyticsCollector {
  private speechEndAt = 0;
  private firstTokenAt: number | undefined;
  private ttsFirstByteAt: number | undefined;
  private gatewayFirstByteAt: number | undefined;
  private doneTimings: Record<string, number> = {};

  markSpeechEnd(): void {
    this.speechEndAt = Date.now();
  }

  markGatewayFirstByte(): void {
    if (this.gatewayFirstByteAt === undefined) {
      this.gatewayFirstByteAt = Date.now();
    }
  }

  markFirstToken(): void {
    if (this.firstTokenAt === undefined) {
      this.firstTokenAt = Date.now();
    }
  }

  markTtsFirstByte(): void {
    if (this.ttsFirstByteAt === undefined) {
      this.ttsFirstByteAt = Date.now();
    }
  }

  setDoneTimings(timings: Record<string, number>): void {
    this.doneTimings = timings;
  }

  build(turnId: string, sttLatencyMs: number): VoiceTurnAnalytics {
    const now = Date.now();
    const speechEnd = this.speechEndAt || now;
    return {
      turnId,
      sttLatencyMs,
      gatewayLatencyMs: this.gatewayFirstByteAt ? this.gatewayFirstByteAt - speechEnd : 0,
      plannerLatencyMs: this.doneTimings.plan_tools_ms ?? 0,
      toolLatencyMs: Object.entries(this.doneTimings)
        .filter(([k]) => k.includes('tool') || k === 'manifest_ms')
        .reduce((sum, [, v]) => sum + v, 0),
      llmFirstTokenMs: this.firstTokenAt ? this.firstTokenAt - speechEnd : 0,
      ttsFirstByteMs: this.ttsFirstByteAt ? this.ttsFirstByteAt - (this.firstTokenAt ?? speechEnd) : 0,
      totalLatencyMs: (this.ttsFirstByteAt ?? now) - speechEnd,
    };
  }
}
