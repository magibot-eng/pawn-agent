'use client';

interface MerchantPortraitProps {
  name?: string;
  ensName?: string;
}

export default function MerchantPortrait({ name = 'The Tavern Keeper', ensName }: MerchantPortraitProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {/* Portrait frame with iron-wrought SVG border */}
      <div
        className="merchant-frame"
        style={{
          width: '160px',
          height: '200px',
          position: 'relative',
          background: 'linear-gradient(145deg, #c4963a 0%, #8b6914 40%, #5a4020 100%)',
          animation: 'lanternPulse 5s ease-in-out infinite',
          padding: '4px',
        }}
      >
        {/* Iron frame SVG decoration */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          viewBox="0 0 160 200"
          fill="none"
        >
          <rect x="2" y="2" width="156" height="196" rx="4" stroke="#6b4c12" strokeWidth="3" />
          <rect x="6" y="6" width="148" height="188" rx="3" stroke="#8b6914" strokeWidth="1.5" />
          {/* Corner flourishes */}
          <path d="M10 30 L10 10 L30 10" stroke="#a07820" strokeWidth="2" fill="none" />
          <path d="M150 30 L150 10 L130 10" stroke="#a07820" strokeWidth="2" fill="none" />
          <path d="M10 170 L10 190 L30 190" stroke="#a07820" strokeWidth="2" fill="none" />
          <path d="M150 170 L150 190 L130 190" stroke="#a07820" strokeWidth="2" fill="none" />
        </svg>

        {/* Portrait inner */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, #3d2512 0%, #2a1a0e 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {/* Silhouette */}
          <svg viewBox="0 0 100 120" style={{ width: '80%', opacity: 0.6 }}>
            <ellipse cx="50" cy="35" rx="22" ry="26" fill="#1a0f05" />
            <path d="M15 120 Q15 75 50 70 Q85 75 85 120" fill="#1a0f05" />
          </svg>

          {/* Lantern glow overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(232,168,64,0.15) 0%, transparent 70%)',
          }} />
        </div>
      </div>

      {/* Name plate */}
      <div style={{ textAlign: 'center' }}>
        <p style={{
          color: '#f0e0c0',
          fontSize: '14px',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          margin: 0,
        }}>
          {name}
        </p>
        {ensName && (
          <p style={{
            color: '#c4a870',
            fontSize: '11px',
            letterSpacing: '0.15em',
            margin: '4px 0 0 0',
          }}>
            {ensName}
          </p>
        )}
      </div>
    </div>
  );
}