'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Negotiations, type AcceptQuoteResponse, type ChatResponse, type ExecutionRecord, type NegotiationState, type NegotiationQuote } from '../lib/api';

type Message = {
  id: string;
  sender: 'merchant' | 'seller';
  text: string;
  timestamp: string;
};

type TypingState = {
  active: boolean;
  text: string;
  charIndex: number;
};

type RuntimeStatus = {
  mode: 'demo_disconnected' | 'scripted_fallback' | 'live_llm' | 'provider_error_fallback';
  provider?: string | null;
  model?: string | null;
  error?: string | null;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isEthLikeToken(token: string | null | undefined): boolean {
  const normalized = (token ?? '').trim().toLowerCase();
  return normalized === 'eth' || normalized === ZERO_ADDRESS;
}

function formatTokenLabel(token: string | null | undefined): string {
  if (isEthLikeToken(token)) return 'ETH';
  return token || '—';
}

function formatPayoutDisplay(amount: string | null | undefined, token: string | null | undefined): string {
  if (!amount) return '—';
  return `${amount} ${formatTokenLabel(token)}`;
}

function formatWeiDisplay(wei: string | null | undefined): string {
  if (!wei) return '—';
  const digits = wei.replace(/\D/g, '');
  if (!digits) return wei;
  const padded = digits.padStart(19, '0');
  const whole = padded.slice(0, -18).replace(/^0+(?=\d)/, '') || '0';
  const fraction = padded.slice(-18).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction} ETH` : `${whole} ETH`;
}

const FALLBACK_MESSAGES: Message[] = [
  {
    id: 'fallback-1',
    sender: 'seller',
    text: 'I have 18,000 TIDE to move before the market window closes. Can your house clear it?',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
  {
    id: 'fallback-2',
    sender: 'merchant',
    text: 'The harbor is shallow for this cargo. I quote against executable conditions, not tavern gossip pricing.',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

interface MerchantChatProps {
  negotiationId: string;
  shopEnsName: string;
}

// ---------------------------------------------------------------------------
// Quote Card
// ---------------------------------------------------------------------------

interface QuoteCardProps {
  quote: NegotiationQuote;
  onAccept: () => void;
  onCounter: () => void;
  counterMode: boolean;
  counterInput: string;
  onCounterInputChange: (v: string) => void;
  onCounterSubmit: () => void;
  onCounterCancel: () => void;
  disabled: boolean;
}

function QuoteCard({
  quote,
  onAccept,
  onCounter,
  counterMode,
  counterInput,
  onCounterInputChange,
  onCounterSubmit,
  onCounterCancel,
  disabled,
}: QuoteCardProps) {
  return (
    <div className="rounded-panel border border-[#d4af37]/50 bg-[rgba(212,175,55,0.08)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#d4af37]">Merchant Quote</p>
        <span className="rounded-full border border-[#d4af37]/40 bg-[rgba(212,175,55,0.15)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#d4af37]">
          {quote.status}
        </span>
      </div>

      {/* Ask vs Offer */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">You Ask</p>
          <p className="mt-1 text-base text-[#f5e9c9]">
            {quote.seller_ask_amount
              ? `${Number(quote.seller_ask_amount).toLocaleString()} ${quote.seller_ask_token}`
              : '—'}
          </p>
          {quote.seller_ask_price && (
            <p className="text-[11px] text-[#a08050]">@ {quote.seller_ask_price} each</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Merchant Offers</p>
          <p className="mt-1 text-base text-[#f5e9c9]">
            {formatPayoutDisplay(quote.payout_amount, quote.payout_token)}
          </p>
          {quote.expiry && (
            <p className="text-[11px] text-[#a08050]">Expires: {quote.expiry}</p>
          )}
        </div>
      </div>

      {/* Counter input */}
      {counterMode && (
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={counterInput}
            onChange={(e) => onCounterInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCounterSubmit()}
            placeholder="Your counter offer (e.g. 0.0001 ETH)"
            className="merchant-inset flex-1 rounded-panel border border-outline bg-surfaceLowest px-3 py-2 text-sm text-[#f5e9c9] placeholder:text-[#7a6040] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/60"
          />
          <button
            onClick={onCounterSubmit}
            disabled={!counterInput.trim() || disabled}
            className="rounded-panel border border-primary bg-transparent px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
          <button
            onClick={onCounterCancel}
            className="rounded-panel border border-outlineVariant px-3 py-2 text-xs uppercase tracking-[0.2em] text-[#a08050] hover:bg-surfaceLow"
          >
            ✕
          </button>
        </div>
      )}

      {/* Actions */}
      {!counterMode && (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            disabled={disabled || quote.status !== 'quoted'}
            className="flex-1 rounded-panel border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✓ Accept
          </button>
          <button
            onClick={onCounter}
            disabled={disabled || quote.status !== 'quoted'}
            className="flex-1 rounded-panel border border-outlineVariant bg-transparent px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#f5e9c9] hover:bg-surfaceLow disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↗ Counter
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MerchantChat
// ---------------------------------------------------------------------------

export default function MerchantChat({ negotiationId, shopEnsName }: MerchantChatProps) {
  const [messages, setMessages] = useState<Message[]>(FALLBACK_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [typing, setTyping] = useState<TypingState>({ active: false, text: '', charIndex: 0 });
  const [connected, setConnected] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({ mode: 'demo_disconnected' });
  const [negotiationState, setNegotiationState] = useState<NegotiationState | null>(null);
  const [activeQuote, setActiveQuote] = useState<NegotiationQuote | null>(null);
  const [executionRecord, setExecutionRecord] = useState<ExecutionRecord | null>(null);
  const [counterMode, setCounterMode] = useState(false);
  const [counterInput, setCounterInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history from backend on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const neg = await Negotiations.get(negotiationId);
        const log = JSON.parse(neg.chat_log || '[]') as Array<{
          sender: string;
          text: string;
          timestamp: string;
        }>;
        setConnected(true);
        setRuntimeStatus({ mode: 'scripted_fallback' });
        setNegotiationState(neg.negotiation_state ?? null);
        if (log.length > 0) {
          setMessages(
            log.map((entry, i) => ({
              id: `msg-${i}`,
              sender: entry.sender === 'merchant' ? 'merchant' : 'seller',
              text: entry.text,
              timestamp: entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '',
            }))
          );
        } else {
          setMessages([]);
        }
      } catch {
        setConnected(false);
        setRuntimeStatus({ mode: 'demo_disconnected' });
        setNegotiationState(null);
        setMessages(FALLBACK_MESSAGES);
      }
    }
    loadHistory();
  }, [negotiationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  // Streaming effect: reveal characters one by one
  useEffect(() => {
    if (!typing.active) return;
    if (typing.charIndex >= typing.text.length) {
      const newMsg: Message = {
        id: `msg-${Date.now()}`,
        sender: 'merchant',
        text: typing.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, newMsg]);
      setTyping({ active: false, text: '', charIndex: 0 });
      return;
    }
    const timer = setTimeout(() => {
      setTyping((prev) => ({ ...prev, charIndex: prev.charIndex + 1 }));
    }, 18);
    return () => clearTimeout(timer);
  }, [typing]);

  function describeRuntimeStatus(status: RuntimeStatus): string {
    if (status.mode === 'live_llm') {
      return `Live AI: ${status.provider ?? 'provider'}${status.model ? ` • ${status.model}` : ''}`;
    }
    if (status.mode === 'provider_error_fallback') {
      return `Provider fallback: ${status.provider ?? 'configured provider'} failed${status.error ? ` — ${status.error}` : ''}`;
    }
    if (status.mode === 'scripted_fallback') {
      return 'Scripted fallback: no active provider key is being used yet.';
    }
    return 'Demo mode: backend unavailable, showing local placeholder chat.';
  }

  function statusStyles(status: RuntimeStatus): string {
    if (status.mode === 'live_llm') {
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    }
    if (status.mode === 'provider_error_fallback') {
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    }
    return 'border-[#d4af37]/30 bg-[rgba(212,175,55,0.08)] text-[#d4af37]';
  }

  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? inputValue).trim();
    if (!text) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const sellerMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'seller',
      text,
      timestamp,
    };
    setMessages((prev) => [...prev, sellerMsg]);
    setInputValue('');
    setCounterMode(false);
    setCounterInput('');
    setActiveQuote(null);
    setExecutionRecord(null);

    if (!connected) {
      setRuntimeStatus({ mode: 'demo_disconnected' });
      setTyping({
        active: true,
        text: '⚓ The house hears you. Show me your cargo manifest and I will quote accordingly.',
        charIndex: 0,
      });
      return;
    }

    try {
      setTyping({ active: true, text: '⚓ The harbormaster is thinking…', charIndex: 0 });
      const resp: ChatResponse = await Negotiations.chat(negotiationId, text);
      setRuntimeStatus({
        mode: (resp.response_mode as RuntimeStatus['mode']) || 'scripted_fallback',
        provider: resp.provider,
        model: resp.model,
        error: resp.error,
      });
      setNegotiationState(resp.negotiation_state ?? null);
      if (resp.quote) {
        setActiveQuote(resp.quote);
      }
      setTyping({ active: true, text: resp.merchant_response, charIndex: 0 });
    } catch {
      setRuntimeStatus({ mode: 'demo_disconnected' });
      setTyping({
        active: true,
        text: '⚓ The harbor signal is lost. Try again when the fog clears.',
        charIndex: 0,
      });
    }
  }, [inputValue, connected, negotiationId]);

  const handleAccept = useCallback(async () => {
    if (!activeQuote) return;
    if (!connected) {
      setRuntimeStatus({ mode: 'demo_disconnected' });
      setTyping({
        active: true,
        text: '⚓ Settlement cannot proceed while the harbor is offline.',
        charIndex: 0,
      });
      return;
    }

    try {
      setTyping({ active: true, text: '⚓ Sealing the bargain and preparing settlement…', charIndex: 0 });
      const resp: AcceptQuoteResponse = await Negotiations.acceptQuote(negotiationId, {
        payout_token: activeQuote.payout_token,
        payout_amount: activeQuote.payout_amount,
        expiry: activeQuote.expiry || '5m',
      });
      setExecutionRecord(resp.execution);
      setActiveQuote((current) => (current ? { ...current, status: 'accepted' } : current));
      setNegotiationState(resp.negotiation.negotiation_state ?? null);
      setTyping({
        active: true,
        text: `⚓ Terms accepted. Base Sepolia settlement ${resp.execution.state}. Tx ${resp.execution.tx_hash ?? 'pending'}.`,
        charIndex: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Settlement failed.';
      setTyping({
        active: true,
        text: `⚓ I cannot settle this yet. ${message}`,
        charIndex: 0,
      });
    }
  }, [activeQuote, connected, negotiationId]);

  const handleCounter = useCallback(() => {
    setCounterMode(true);
    setCounterInput('');
  }, []);

  const handleCounterSubmit = useCallback(() => {
    if (!counterInput.trim()) return;
    handleSend(`Counter offer: ${counterInput.trim()}`);
    setCounterMode(false);
    setCounterInput('');
  }, [counterInput, handleSend]);

  const handleCounterCancel = useCallback(() => {
    setCounterMode(false);
    setCounterInput('');
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Runtime badge */}
      <div className={`mb-3 flex items-center gap-2 rounded-panel border px-3 py-2 ${statusStyles(runtimeStatus)}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
        <p className="text-[11px] uppercase tracking-widest">
          {describeRuntimeStatus(runtimeStatus)}
        </p>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-h-0 flex-col">
          {/* Message List */}
          <div
            ref={listRef}
            className="flex-1 space-y-4 overflow-y-auto pr-2"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.3) transparent' }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'seller' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-panel px-4 py-3 text-sm ${
                    msg.sender === 'merchant'
                      ? 'merchant-inset text-[#f4e7c7]'
                      : 'border border-outline bg-[linear-gradient(135deg,rgba(212,175,55,0.18),rgba(148,112,44,0.14))] text-[#f5e9c9]'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">
                      {msg.sender === 'merchant' ? `Harbormaster ${shopEnsName}` : 'You'}
                    </span>
                    <span className="text-[10px] text-[#a08050]">{msg.timestamp}</span>
                  </div>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typing.active && (
              <div className="flex justify-start">
                <div className="max-w-[82%] rounded-panel merchant-inset px-4 py-3 text-sm text-[#f4e7c7]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">
                      Harbormaster {shopEnsName}
                    </span>
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d4af37]" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d4af37]" style={{ animationDelay: '160ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#d4af37]" style={{ animationDelay: '320ms' }} />
                    </span>
                  </div>
                  <p className="leading-relaxed">
                    {typing.text.slice(0, typing.charIndex)}
                    <span className="animate-pulse text-[#d4af37]">|</span>
                  </p>
                </div>
              </div>
            )}

            {/* Quote card — shown below the last merchant message when active */}
            {activeQuote && !typing.active && (
              <div className="flex justify-start">
                <div className="max-w-[82%]">
                  <QuoteCard
                    quote={activeQuote}
                    onAccept={handleAccept}
                    onCounter={handleCounter}
                    counterMode={counterMode}
                    counterInput={counterInput}
                    onCounterInputChange={setCounterInput}
                    onCounterSubmit={handleCounterSubmit}
                    onCounterCancel={handleCounterCancel}
                    disabled={typing.active}
                  />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input Bar */}
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="State your offer or ask…"
                rows={2}
                className="merchant-inset w-full resize-none rounded-panel border border-outline bg-surfaceLowest px-4 py-3 text-sm text-[#f5e9c9] placeholder:text-[#7a6040] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/60"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.3) transparent' }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || typing.active}
              className="flex h-[3.25rem] items-center justify-center rounded-panel border border-primary bg-transparent px-5 text-sm font-bold uppercase tracking-[0.2em] text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>

        <aside className="merchant-panel rounded-panel border border-outlineVariant/70 p-4 text-sm text-[#f4e7c7] xl:self-start">
          <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Negotiation State</p>
          {negotiationState ? (
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Token</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.token}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Amount</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.amount}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Seller Ask</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.seller_ask}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Urgency</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.urgency}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Merchant Stance</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.merchant_stance}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-onSurfaceVariant">Next Action</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.next_action}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 leading-relaxed text-[#f0dfb4]">
              No structured negotiation state yet. Send a seller message and the merchant will start filling this in.
            </p>
          )}

          {/* Quote summary in sidebar */}
          {activeQuote && (
            <div className="mt-6 border-t border-outlineVariant/50 pt-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Active Quote</p>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Payout</dt>
                  <dd className="text-xs text-[#f5e9c9]">
                    {formatPayoutDisplay(activeQuote.payout_amount, activeQuote.payout_token)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Expiry</dt>
                  <dd className="text-xs text-[#f5e9c9]">{activeQuote.expiry || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Status</dt>
                  <dd className="text-xs text-[#d4af37]">{activeQuote.status}</dd>
                </div>
              </dl>
            </div>
          )}

          {executionRecord && (
            <div className="mt-6 border-t border-outlineVariant/50 pt-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-onSurfaceVariant">Settlement</p>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Chain</dt>
                  <dd className="text-xs text-[#f5e9c9]">Base Sepolia</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">State</dt>
                  <dd className="text-xs text-[#f5e9c9]">{executionRecord.state}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Tx</dt>
                  <dd className="max-w-[10rem] truncate text-xs text-[#f5e9c9]">{executionRecord.tx_hash ?? 'pending'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Payout sent</dt>
                  <dd className="text-xs text-[#f5e9c9]">{formatWeiDisplay(executionRecord.payout_sent_wei)}</dd>
                </div>
                {executionRecord.error_message && (
                  <div className="space-y-1">
                    <dt className="text-[10px] uppercase tracking-[0.2em] text-onSurfaceVariant">Error</dt>
                    <dd className="text-xs text-amber-300">{executionRecord.error_message}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
