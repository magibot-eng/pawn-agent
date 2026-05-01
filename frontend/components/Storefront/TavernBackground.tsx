'use client';

import { useRef, useState } from 'react';

interface Layer {
  label: string;
  bg: string;
  translateX: number;
  translateY: number;
  scale: number;
}

export default function TavernBackground() {
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const { clientX, clientY, currentTarget } = e;
    const { width, height } = currentTarget.getBoundingClientRect();
    const x = ((clientX / width) - 0.5) * 20;
    const y = ((clientY / height) - 0.5) * 20;
    timeoutRef.current = setTimeout(() => setParallax({ x: 0, y: 0 }), 1500);
    setParallax({ x, y });
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: '#1a0f05',
        zIndex: 0,
        cursor: 'default',
      }}
    >
      {/* Layer 1: Stone wall */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 50% 30%, #2d1f10 0%, #1a0f05 60%, #0d0805 100%)
        `,
        transform: `translate(${parallax.x * 0.3}px, ${parallax.y * 0.3}px)`,
        transition: 'transform 0.8s ease-out',
      }} />

      {/* Layer 2: Wood counter / shelf */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '45%',
        background: `
          linear-gradient(to bottom,
            #3d2512 0%,
            #4a2c17 20%,
            #5a3520 50%,
            #3d2512 100%
          )
        `,
        transform: `translate(${parallax.x * 0.6}px, ${parallax.y * 0.6}px)`,
        transition: 'transform 0.6s ease-out',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.6)',
      }}>
        {/* Wood grain lines */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'repeating-linear-gradient(92deg, transparent, transparent 40px, rgba(0,0,0,0.08) 40px, rgba(0,0,0,0.08) 42px)',
        }} />
      </div>

      {/* Layer 3: Dark vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)',
      }} />

      {/* Candle glow - multiple warm spots */}
      <div
        className="candle-glow"
        style={{
          position: 'absolute',
          top: '10%',
          left: '20%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(240,184,96,0.15) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
          transform: `translate(${parallax.x * 1.5}px, ${parallax.y * 1.5}px)`,
          transition: 'transform 0.4s ease-out',
          animationDelay: '0s',
        }}
      />
      <div
        className="candle-glow"
        style={{
          position: 'absolute',
          top: '15%',
          right: '25%',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(240,184,96,0.12) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
          transform: `translate(${parallax.x * -1.2}px, ${parallax.y * 1.2}px)`,
          transition: 'transform 0.5s ease-out',
          animationDelay: '1.2s',
        }}
      />
      <div
        className="candle-glow"
        style={{
          position: 'absolute',
          top: '30%',
          left: '45%',
          width: '250px',
          height: '250px',
          background: 'radial-gradient(circle, rgba(232,168,64,0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
          transform: `translate(${parallax.x * 1.0}px, ${parallax.y * -0.8}px)`,
          transition: 'transform 0.5s ease-out',
          animationDelay: '0.6s',
        }}
      />
    </div>
  );
}