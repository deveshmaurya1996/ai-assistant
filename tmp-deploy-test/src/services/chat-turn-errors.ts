export class ChatTurnAbortedError extends Error {
  readonly partialText: string;

  constructor(partialText: string) {
    super('Chat turn aborted');
    this.name = 'ChatTurnAbortedError';
    this.partialText = partialText;
  }
}
