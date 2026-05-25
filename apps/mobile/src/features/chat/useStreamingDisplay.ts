import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 16;

function charsPerTick(backlog: number): number {
  if (backlog > 60) return 5;
  if (backlog > 20) return 3;
  return 1;
}

export function useStreamingDisplay() {
  const targetRef = useRef('');
  const [visibleText, setVisibleText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      setVisibleText((current) => {
        const target = targetRef.current;
        if (current.length >= target.length) {
          return current;
        }
        const backlog = target.length - current.length;
        const step = charsPerTick(backlog);
        return target.slice(0, current.length + step);
      });
    }, TICK_MS);
  }, []);

  useEffect(() => {
    return () => stopTick();
  }, [stopTick]);

  const beginStream = useCallback(() => {
    targetRef.current = '';
    setVisibleText('');
    setIsStreaming(true);
    startTick();
  }, [startTick]);

  const appendChunk = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      targetRef.current += chunk;
      setIsStreaming(true);
      startTick();
    },
    [startTick]
  );

  const reset = useCallback(() => {
    stopTick();
    targetRef.current = '';
    setVisibleText('');
    setIsStreaming(false);
  }, [stopTick]);

  const endStream = useCallback(() => {
    const full = targetRef.current;
    setVisibleText(full);
    stopTick();
    targetRef.current = '';
    setIsStreaming(false);
    return full;
  }, [stopTick]);

  const getTargetText = useCallback(() => targetRef.current, []);

  return {
    visibleText,
    isStreaming,
    targetText: getTargetText,
    beginStream,
    appendChunk,
    reset,
    endStream,
  };
}
