import { useEffect, useRef } from 'react';

export function usePourSound(enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (enabled && !audioRef.current) {
      audioRef.current = new Audio('/sounds/pour-loop.mp3');
      audioRef.current.loop = true;
      audioRef.current.play();
    }
    if (!enabled && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [enabled]);
}

interface LiquidStreamProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  speed?: number; // 1 = normal, 1.5-2 = slower
}

export function LiquidStream({ from, to, speed = 1 }: LiquidStreamProps) {
  const duration = speed * 0.8; // base 800ms, adjusted by speed
  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full"
      style={{ zIndex: 10 }}
    >
      <defs>
        <linearGradient id="liquid-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="100%" stopColor="#d1d5db" />
        </linearGradient>
      </defs>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="url(#liquid-gradient)"
        strokeWidth="6"
        strokeLinecap="round"
        style={{
          transition: `all ${duration}s ease-out`,
        }}
      />
    </svg>
  );
}
