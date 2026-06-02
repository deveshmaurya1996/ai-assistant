
export function isNoSpeechTranscriptionError(message: string): boolean {
  return /no speech detected|recording too short|too short or empty|empty transcription/i.test(
    message
  );
}

export function isFfmpegRequiredError(message: string): boolean {
  return /ffmpeg is required|ffprobe is required/i.test(message);
}
