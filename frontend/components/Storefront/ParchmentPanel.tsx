'use client';

import { useState, KeyboardEvent } from 'react';

interface Message {
  id: string;
  role: 'merchant' | 'customer';
  text: string;
}

interface ParchmentPanelProps {
  welcomeMessage?: string;
  messages: Message[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ParchmentPanel({ welcomeMessage = 'State your token, amount, and ask.', messages, onSend, disabled }: ParchmentPanelProps) {
  const [input, setInput] = useState('');

  function handleSend() {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(145deg, #f5e8c4 0%, #e8d4a8 50%, #d4bc82 100%)',
      borderRadius: '8px',
      padding: '20px',
      position: 'relative',
      boxShadow: `
        inset 0 2px 4px rgba(139,90,43,0.2),
        inset 0 -3px 10px rgba(0,0,0,0.1),
        0 8px 32px rgba(0,0,0,0.5)
      `,
      border: '2px solid #b89a5c',
      minHeight: '300px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      {/* Parchment texture overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 3px,
          rgba(139,109,47,0.03) 3px,
          rgba(139,109,47,0.03) 6px
        )`,
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }} />

      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(139,90,43,0.3)',
        paddingBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '16px' }}>📜</span>
        <p style={{
          color: '#4a3020',
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          margin: 0,
        }}>
          Merchant's Counter
        </p>
      </div>

      {/* Dialogue messages */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxHeight: '320px',
        overflowY: 'auto',
        paddingRight: '4px',
      }}>
        {/* Welcome message */}
        {!messages.length && (
          <div style={{
            color: '#5a4030',
            fontSize: '14px',
            fontStyle: 'italic',
            lineHeight: 1.6,
          }}>
            <em>"{welcomeMessage}"</em>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'merchant' ? 'flex-start' : 'flex-end',
          }}>
            <span style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: msg.role === 'merchant' ? '#8b6914' : '#6b3d1f',
              marginBottom: '4px',
            }}>
              {msg.role === 'merchant' ? '— Tavern Keeper' : '— You'}
            </span>
            <div style={{
              background: msg.role === 'merchant'
                ? 'rgba(139,90,43,0.1)'
                : 'rgba(74,44,23,0.12)',
              border: `1px solid ${msg.role === 'merchant' ? 'rgba(139,90,43,0.2)' : 'rgba(74,44,23,0.2)'}`,
              borderRadius: '6px',
              padding: '10px 14px',
              maxWidth: '85%',
              color: '#2a1a0e',
              fontSize: '14px',
              lineHeight: 1.6,
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Quill text input */}
      <div style={{
        borderTop: '1px solid rgba(139,90,43,0.3)',
        paddingTop: '12px',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-end',
      }}>
        {/* Quill icon */}
        <div style={{
          fontSize: '20px',
          paddingBottom: '8px',
          opacity: 0.6,
        }}>
          🪶
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Speak your offer..."
          rows={2}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.4)',
            border: '1px solid rgba(139,90,43,0.4)',
            borderRadius: '6px',
            padding: '10px 14px',
            color: '#2a1a0e',
            fontSize: '14px',
            fontFamily: 'serif',
            resize: 'none',
            outline: 'none',
            boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.1)',
            lineHeight: 1.5,
          }}
        />

        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="tavern-button"
          style={{
            padding: '10px 18px',
            fontSize: '11px',
            borderRadius: '6px',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}