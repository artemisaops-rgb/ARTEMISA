import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface IceFallProps {
  intensity?: number; // 1-3: how many cubes
  spread?: number;
  dropHeight?: number;
  origin?: { x: number; y: number };
}

export function IceFall({
  intensity = 1,
  spread = 60,
  dropHeight = 200,
  origin = { x: 50, y: 0 },
}: IceFallProps) {
  const cubes = useMemo(() => {
    const count = Math.min(intensity, 3) + 1; // 2-4 cubes
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      offsetX: (Math.random() - 0.5) * spread,
      duration: 0.6 + Math.random() * 0.3, // 0.6-0.9s
      delay: i * 0.1,
    }));
  }, [intensity, spread]);

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: origin.x, top: origin.y }}
    >
      {cubes.map((cube) => (
        <motion.svg
          key={cube.id}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          className="absolute"
          initial={{ opacity: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [0, dropHeight],
          }}
          transition={{
            duration: cube.duration,
            delay: cube.delay,
            repeat: Infinity,
            ease: 'easeIn',
          }}
          style={{
            x: cube.offsetX,
          }}
        >
          <path
            d="M12 2L4 7v10l8 5 8-5V7z"
            fill="url(#ice-gradient)"
            stroke="#a5f3fc"
            strokeWidth="1"
          />
          <defs>
            <linearGradient id="ice-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
          </defs>
        </motion.svg>
      ))}
    </div>
  );
}
