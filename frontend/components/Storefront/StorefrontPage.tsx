'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TavernBackground from './TavernBackground';
import MerchantPortrait from './MerchantPortrait';
import ParchmentPanel from './ParchmentPanel';
import OfferCard from './OfferCard';
import { useBackend, MOCK_SHOP, MOCK_NEGOTIATION, MOCK_QUOTE_RESPONSE, MOCK_MERCHANT_RESPONSES } from '../../lib/useBackend';
import type { Shop, NegotiationSession, ChatResponse } from '../../lib/api';
import '../../styles/tavern-theme.css';
import '../../styles/animations.css';

interface Message {
  id: string;
  role: 'merchant' | 'customer';
  text: string;
}

interface NegotiationState {
  token: string;
  amount: string;
  seller_ask: string;
  urgency: string;
  merchant_stance: string;
  next_action: string;
}

let messageId = 0;
function nextId() { return `msg-${++messageId}`; }

export default function StorefrontPage() {
  const { fetchShop, startNegotiation, sendChat } = useBackend();

  const [shop, setShop] = useState<Shop | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [negState, setNegState] = useState<NegotiationState | null>(null);
  const [showOffer, setShowOffer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const responseIdxRef = useRef(0);
  const mockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load shop on mount
  useEffect(() => {
    async function load() {
      try {
        const found = await fetchShop({ ens_name: 'tavern.pawnagent.eth' });
        if (found) {
          setShop(found);
        } else {
          setShop(MOCK_SHOP);
          setMockMode(true);
        }
      } catch {
        setShop(MOCK_SHOP);
        setMockMode(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchShop]);

  // Auto-start mock negotiation when shop is loaded in mock mode
  useEffect(() => {
    if (!shop || mockMode === false || negotiation) return;
    // Simulate a started negotiation
    setNegotiation(MOCK_NEGOTIATION);
  }, [shop, mockMode, negotiation]);

  const simulateMerchantResponse = useCallback((customerText: string) => {
    if (mockTimerRef.current) clearTimeout(mockTimerRef.current);

    // Add customer's message
    setMessages(prev => [...prev, { id: nextId(), role: 'customer', text: customerText }]);
    setSending(true);

    const delay = 1200 + Math.random() * 800;
    mockTimerRef.current = setTimeout(() => {
      // Pick merchant response
      const resp = MOCK_MERCHANT_RESPONSES[responseIdxRef.current % MOCK_MERCHANT_RESPONSES.length];
      responseIdxRef.current++;

      // Simulate quote on 3rd message
      if (responseIdxRef.current >= 3) {
        setShowOffer(true);
      }

      setMessages(prev => [...prev, { id: nextId(), role: 'merchant', text: resp }]);
      setNegState(MOCK_QUOTE_RESPONSE.negotiation_state ?? null);
      setSending(false);
    }, delay);
  }, []);

  async function handleSend(text: string) {
    if (!text.trim()) return;

    if (mockMode) {
      simulateMerchantResponse(text);
      return;
    }

    // Real backend path
    try {
      let neg = negotiation;
      if (!neg) {
        neg = await startNegotiation({
          shop_id: shop!.id,
          seller_address: '0xsellersellersellersellersellerseller1234',
          input_token: '0x0000000000000000000000000000000000000000',
          input_amount: '1000000000000000000',
        });
        setNegotiation(neg);
      }

      setSending(true);
      setMessages(prev => [...prev, { id: nextId(), role: 'customer', text }]);

      const resp = await sendChat(neg.id, text);

      setMessages(prev => [...prev, { id: nextId(), role: 'merchant', text: resp.merchant_response }]);
      if (resp.negotiation_state) setNegState(resp.negotiation_state);
      if (resp.quote) setShowOffer(true);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: nextId(), role: 'merchant', text: 'The merchant seems busy. Try again shortly.' }]);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#2a1a0e', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e8a840', fontSize: '14px', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Opening the tavern…</p>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#2a1a0e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#f0e0c0' }}>Shop not found.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', fontFamily: 'serif' }}>
      {/* Tavern atmosphere background */}
      <TavernBackground />

      {/* Main content */}
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header bar */}
        <header style={{
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(196,168,112,0.15)',
          background: 'rgba(26,15,5,0.5)',
          backdropFilter: 'blur(8px)',
        }}>
          <div>
            <p style={{ color: '#8b6914', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3em', margin: 0 }}>
              {mockMode ? '✨ Mock Preview' : 'Live Pawn Shop'}
            </p>
            <h1 style={{
              color: '#f0e0c0',
              fontSize: 'clamp(20px, 3vw, 28px)',
              fontWeight: 'bold',
              margin: '6px 0 0 0',
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}>
              {shop.display_name}
            </h1>
            <p style={{ color: '#c4a870', fontSize: '11px', letterSpacing: '0.15em', margin: '4px 0 0 0' }}>
              {shop.ens_name}
            </p>
          </div>

          <MerchantPortrait
            name="The Tavern Keeper"
            ensName={shop.ens_name}
          />
        </header>

        {/* Main content area */}
        <main style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '24px',
          padding: '24px 32px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}>

          {/* Left: Merchant chat panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Welcome banner */}
            <div style={{
              background: 'rgba(232,168,64,0.08)',
              border: '1px solid rgba(232,168,64,0.2)',
              borderRadius: '8px',
              padding: '16px 20px',
            }}>
              <p style={{
                color: '#c4a870',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                margin: '0 0 8px 0',
              }}>
                Welcome
              </p>
              <p style={{ color: '#f0e0c0', fontSize: '15px', fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>
                "{shop.welcome_message || 'State your token, amount, and ask. The merchant will respond in-line.'}"
              </p>
            </div>

            {/* Chat panel */}
            <div style={{ maxWidth: '700px', width: '100%' }}>
              <ParchmentPanel
                welcomeMessage={shop.welcome_message ?? undefined}
                messages={messages}
                onSend={handleSend}
                disabled={sending}
              />
            </div>
          </div>

          {/* Right: Offer cards sidebar */}
          {showOffer && (
            <div style={{
              position: 'fixed',
              right: '32px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '280px',
              zIndex: 10,
            }}>
              <OfferCard
                token="ETH"
                amount="1.0"
                payoutAmount="750000000000000000"
                sellerAsk="0.8 ETH"
                quote={MOCK_QUOTE_RESPONSE.quote ?? undefined}
                onAccept={() => alert('Deal accepted! Settlement would trigger here.')}
                onCounter={() => setShowOffer(false)}
              />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer style={{
          padding: '16px 32px',
          borderTop: '1px solid rgba(196,168,112,0.1)',
          background: 'rgba(26,15,5,0.4)',
          textAlign: 'center',
        }}>
          <p style={{ color: '#8b6914', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.25em', margin: 0 }}>
            Pawn Agent — {shop.ens_name}
          </p>
        </footer>
      </div>
    </div>
  );
}