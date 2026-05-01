'use client';

import { motion } from 'framer-motion';
import type { NegotiationQuote } from '../../lib/api';

interface OfferCardProps {
  token: string;
  amount: string;
  payoutToken?: string;
  payoutAmount?: string;
  sellerAsk?: string;
  quote?: NegotiationQuote;
  onAccept?: () => void;
  onCounter?: () => void;
}

function formatEth(wei: string): string {
  try {
    const num = parseFloat(wei);
    if (wei === '0' || wei === '0x0') return '0 ETH';
    if (num < 1e10) return `${num.toFixed(4)} ETH`;
    return `${(num / 1e18).toFixed(4)} ETH`;
  } catch {
    return wei;
  }
}

function formatAsk(value: string): string {
  const normalized = value.trim();
  if (/\beth\b/i.test(normalized)) return normalized;
  return `${normalized} ETH`;
}

export default function OfferCard({ token, amount, payoutToken, payoutAmount, sellerAsk, quote, onAccept, onCounter }: OfferCardProps) {
  const displayPayout = payoutAmount ?? quote?.payout_amount;
  const displaySellerAsk = sellerAsk ?? quote?.seller_ask_amount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        ease: [0.34, 1.56, 0.64, 1], // spring
      }}
      style={{
        background: 'linear-gradient(135deg, #5a3520 0%, #3d2414 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,200,100,0.1)',
        border: '1px solid rgba(180,120,50,0.25)',
        borderRadius: '8px',
        padding: '20px',
        transform: 'rotate(-1deg)',
        position: 'relative',
      }}
    >
      {/* Note paper texture edge */}
      <div style={{
        position: 'absolute',
        top: '-1px',
        left: '10%',
        right: '10%',
        height: '3px',
        background: 'linear-gradient(90deg, transparent, rgba(200,160,80,0.4), transparent)',
        borderRadius: '0 0 4px 4px',
      }} />

      <p style={{
        color: '#c4a870',
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        margin: '0 0 12px 0',
      }}>
        📋 Offer Tendered
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <p style={{ color: '#a08050', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 4px 0' }}>
            Your Asset
          </p>
          <p style={{ color: '#f0e0c0', fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
            {amount}
          </p>
          <p style={{ color: '#8b6914', fontSize: '11px', margin: '2px 0 0 0' }}>{token}</p>
        </div>
        <div>
          <p style={{ color: '#a08050', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 4px 0' }}>
            Payout Offered
          </p>
          <p style={{ color: '#e8c040', fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
            {displayPayout ? formatEth(displayPayout) : '—'}
          </p>
          <p style={{ color: '#8b6914', fontSize: '11px', margin: '2px 0 0 0' }}>ETH</p>
        </div>
      </div>

      {displaySellerAsk && (
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '6px',
          padding: '8px 12px',
          marginBottom: '16px',
        }}>
          <p style={{ color: '#a08050', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 2px 0' }}>
            Your Ask
          </p>
          <p style={{ color: '#f0dfb4', fontSize: '14px', margin: 0 }}>
            {formatAsk(displaySellerAsk)}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        {onCounter && (
          <button
            className="tavern-button-secondary"
            onClick={onCounter}
            style={{
              padding: '10px 18px',
              fontSize: '11px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Counter
          </button>
        )}
        {onAccept && (
          <button
            className="tavern-button"
            onClick={onAccept}
            style={{
              padding: '10px 18px',
              fontSize: '11px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Accept
          </button>
        )}
      </div>
    </motion.div>
  );
}