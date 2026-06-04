import { useEffect, useRef, useState } from 'react';

export function useSmoothStreamText(target: string, active: boolean): string {
  const [display, setDisplay] = useState(active ? '' : target);
  const displayRef = useRef(display);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!active) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    if (!target && displayRef.current) {
      displayRef.current = '';
      setDisplay('');
    }

    let frame = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      const t = targetRef.current;
      let d = displayRef.current;

      if (d.length > t.length) {
        d = t;
      } else if (d.length < t.length) {
        const behind = t.length - d.length;
        const step = Math.max(1, Math.min(18, Math.ceil(behind / 8)));
        d = t.slice(0, d.length + step);
      }

      if (d !== displayRef.current) {
        displayRef.current = d;
        setDisplay(d);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active, target]);

  return active ? display : target;
}
