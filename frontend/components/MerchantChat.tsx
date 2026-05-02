'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { Negotiations, type AcceptQuoteResponse, type ChatResponse, type ExecutionRecord, type NegotiationState, type NegotiationQuote } from '../lib/api';
import RainbowConnectAction from './RainbowConnectAction';

// ── ABI fragments ──────────────────────────────────────────────────────────

const IERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const PAWN_TOKEN_ADDRESS = '0x621B62fBFe0ABEf52eD2aAfd0787Fb1DAEEed1e5' as const;

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
  merchantAddress: string;
}

// ---------------------------------------------------------------------------
// Quote Card (inside chat)
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
  sellerAddress?: string | null;
  sellerStage?: 'idle' | 'approving' | 'accepting' | 'done';
  isApproveConfirmed?: boolean;
  isApproveLoading?: boolean;
  approveTxHash?: string;
  onApprove?: () => void;
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
  sellerAddress,
  sellerStage = 'idle',
  isApproveConfirmed,
  isApproveLoading,
  approveTxHash,
  onApprove,
}: QuoteCardProps) {
  return (
    <div className="tavern-quote-card">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="quote-header">Merchant Quote</p>
        <span className="quote-status">{quote.status}</span>
      </div>

      {/* Ask vs Offer */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className="tavern-muted">You Ask</p>
          <p className="mt-1 text-base" style={{ color: 'var(--parchment)' }}>
            {quote.seller_ask_amount
              ? `${Number(quote.seller_ask_amount).toLocaleString()} ${quote.seller_ask_token}`
              : '—'}
          </p>
          {quote.seller_ask_price && (
            <p className="text-[11px]" style={{ color: 'var(--parchment-dark)' }}>@ {quote.seller_ask_price} each</p>
          )}
        </div>
        <div>
          <p className="tavern-muted">Merchant Offers</p>
          <p className="mt-1 text-base" style={{ color: 'var(--parchment)' }}>
            {formatPayoutDisplay(quote.payout_amount, quote.payout_token)}
          </p>
          {quote.expiry && (
            <p className="text-[11px]" style={{ color: 'var(--parchment-dark)' }}>Expires: {quote.expiry}</p>
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
            className="parchment-input flex-1"
          />
          <button
            onClick={onCounterSubmit}
            disabled={!counterInput.trim() || disabled}
            className="tavern-sign-link brass"
            style={{ whiteSpace: 'nowrap' }}
          >
            Send
          </button>
          <button
            onClick={onCounterCancel}
            className="tavern-sign-link"
          >
            ✕
          </button>
        </div>
      )}

      {/* Actions — stub / simulated mode: accept via backend */}
      {!counterMode && sellerStage === 'idle' && (
        <div className="flex gap-2">
          {!sellerAddress ? (
            <div className="flex-1 text-center py-2 text-xs" style={{ color: 'rgba(216,202,163,0.6)' }}>
              Connect your wallet above to accept on-chain
            </div>
          ) : (
            <>
              {!isApproveConfirmed && !approveTxHash ? (
                <button
                  onClick={onApprove}
                  disabled={disabled || quote.status !== 'quoted'}
                  className="flex-1 rounded-panel border text-xs font-bold uppercase tracking-[0.2em] px-4 py-2"
                  style={{
                    borderColor: 'rgba(251,191,36,0.5)',
                    background: 'rgba(251,191,36,0.15)',
                    color: '#fcd34d',
                  }}
                >
                  ⚡ Approve Token
                </button>
              ) : isApproveLoading ? (
                <div className="flex-1 text-center py-2 text-xs" style={{ color: 'rgba(251,191,36,0.7)' }}>
                  ⚡ Confirming…
                </div>
              ) : (
                <div className="flex-1 text-center py-2 text-xs" style={{ color: 'rgba(52,211,153,0.7)' }}>
                  ✓ Allowance set
                </div>
              )}
              <button
                onClick={onAccept}
                disabled={disabled || quote.status !== 'quoted' || (!isApproveConfirmed && !approveTxHash)}
                className="flex-1 rounded-panel border text-xs font-bold uppercase tracking-[0.2em] px-4 py-2"
                style={{
                  borderColor: isApproveConfirmed || approveTxHash ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)',
                  background: 'rgba(52,211,153,0.15)',
                  color: isApproveConfirmed || approveTxHash ? '#6ee7b7' : 'rgba(255,255,255,0.3)',
                }}
              >
                ✓ Accept
              </button>
              <button
                onClick={onCounter}
                disabled={disabled || quote.status !== 'quoted'}
                className="flex-1 tavern-sign-link"
              >
                ↗ Counter
              </button>
            </>
          )}
        </div>
      )}


    </div>
  );
}

// ---------------------------------------------------------------------------
// MerchantChat
// ---------------------------------------------------------------------------

export default function MerchantChat({ negotiationId, shopEnsName, merchantAddress }: MerchantChatProps) {
  const [messages, setMessages] = useState<Message[]>(FALLBACK_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [typing, setTyping] = useState<TypingState>({ active: false, text: '', charIndex: 0 });
  const [connected, setConnected] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({ mode: 'demo_disconnected' });
  const [negotiationState, setNegotiationState] = useState<NegotiationState | null>(null);
  const [activeQuote, setActiveQuote] = useState<NegotiationQuote | null>(null);
  const [executionRecord, setExecutionRecord] = useState<ExecutionRecord | null>(null);
  const [dealOffer, setDealOffer] = useState<import('../lib/api').DealOffer | null>(null);
  // On-chain flow: seller has not yet approved PAWN
  const [sellerStage, setSellerStage] = useState<'idle' | 'approving' | 'accepting' | 'done'>('idle');
  const [chainError, setChainError] = useState<string | null>(null);
  const [counterMode, setCounterMode] = useState(false);
  const [counterInput, setCounterInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { address: sellerAddress } = useAccount();

  const {
    writeContract: approvePAWN,
    data: approveTxHash,
    isPending: isApproving,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();



  const { isSuccess: isApproveConfirmed, isLoading: isApproveLoading } = useWaitForTransactionReceipt({ hash: approveTxHash });


  // Sync chain errors into the UI
  useEffect(() => {
    if (approveError) setChainError(approveError.message);
    else setChainError(null);
  }, [approveError]);



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
      const rawResp = await Negotiations.acceptQuote(negotiationId, {
        payout_token: activeQuote.payout_token,
        payout_amount: activeQuote.payout_amount,
        expiry: activeQuote.expiry || '5m',
      });
      if (!rawResp.success) {
        setTyping({ active: true, text: `⚓ I cannot settle this yet. ${rawResp.error ?? 'Unknown error'}`, charIndex: 0 });
        return;
      }
      const resp = rawResp as AcceptQuoteResponse;
      if (!resp.execution || !resp.deal_offer || !resp.negotiation) {
        setTyping({ active: true, text: `⚓ I cannot settle this yet. ${rawResp.error ?? 'Invalid response from server.'}`, charIndex: 0 });
        return;
      }
      setExecutionRecord(resp.execution);
      setDealOffer(resp.deal_offer);
      setActiveQuote(null);
      setCounterMode(false);
      setCounterInput('');
      setNegotiationState(resp.negotiation.negotiation_state ?? null);
      setTyping({
        active: true,
        text:
          resp.execution.state === 'simulated'
            ? `⚓ Terms accepted. Demo settlement recorded in simulated mode. Ref ${resp.execution.tx_hash ?? 'pending'}.`
            : `⚓ Terms accepted. Base Sepolia settlement ${resp.execution.state}. Tx ${resp.execution.tx_hash ?? 'pending'}.`,
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

  // Trigger the seller's on-chain PAWN approval
  const handleApprovePAWN = useCallback(() => {
    if (!activeQuote || !sellerAddress) return;
    setChainError(null);
    setSellerStage('approving');
    const inputAmount = activeQuote.input_amount ?? '0';
    if (!inputAmount || inputAmount === '0') {
      setChainError('No input amount set for this quote.');
      setSellerStage('idle');
      return;
    }
    let inputAmountWei;
    try {
      inputAmountWei = parseEther(inputAmount);
    } catch {
      setChainError(`Invalid input amount: ${inputAmount}`);
      setSellerStage('idle');
      return;
    }
    approvePAWN({
      address: PAWN_TOKEN_ADDRESS,
      abi: IERC20_ABI,
      functionName: 'approve',
      args: [merchantAddress as `0x${string}`, inputAmountWei],
    });
  }, [activeQuote, sellerAddress, merchantAddress, approvePAWN]);



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
      <div className={`mb-4 flex items-center gap-2 rounded-panel border px-4 py-3 ${statusStyles(runtimeStatus)}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
        <p className="text-[11px] uppercase tracking-widest">
          {describeRuntimeStatus(runtimeStatus)}
        </p>
      </div>

      <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-h-0 flex-col">
          {/* Message List — parchment panel */}
          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto pr-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.3) transparent' }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'seller' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`tavern-message ${msg.sender}`}>
                  <div className="tavern-message-header">
                    <span className="tavern-message-sender">
                      {msg.sender === 'merchant' ? `Harbormaster ${shopEnsName}` : 'You'}
                    </span>
                    <span className="tavern-message-time">{msg.timestamp}</span>
                  </div>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator — ink drip style */}
            {typing.active && (
              <div className="flex justify-start">
                <div className="tavern-message merchant">
                  <div className="tavern-message-header">
                    <span className="tavern-message-sender">Harbormaster {shopEnsName}</span>
                    <span className="flex gap-1 candle-glow" style={{ animationDuration: '2s' }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#8b6914', animation: 'merchantGlow 1.2s ease-in-out infinite', animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#8b6914', animation: 'merchantGlow 1.2s ease-in-out infinite', animationDelay: '160ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#8b6914', animation: 'merchantGlow 1.2s ease-in-out infinite', animationDelay: '320ms' }} />
                    </span>
                  </div>
                  <p className="leading-relaxed">
                    {typing.text.slice(0, typing.charIndex)}
                    <span style={{ color: '#8b6914', animation: 'merchantGlow 0.8s ease-in-out infinite alternate' }}>|</span>
                  </p>
                </div>
              </div>
            )}

            {/* Quote card — shown below the last merchant message when active */}
            {activeQuote && !executionRecord && !typing.active && (
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
                    sellerAddress={sellerAddress}
                    isApproveConfirmed={isApproveConfirmed}
                    isApproveLoading={isApproveLoading}
                    approveTxHash={approveTxHash}
                    onApprove={handleApprovePAWN}
                  />
                </div>
              </div>
            )}

            {/* Completion banner — shown after settlement (stub/simulated mode) */}
            {executionRecord && !activeQuote && sellerStage === 'idle' && (
              <div className="rounded-panel border px-4 py-3 my-3 text-center"
                style={{ borderColor: 'rgba(52,211,153,0.5)', background: 'rgba(52,211,153,0.1)' }}>
                <p className="text-emerald-300 font-bold uppercase tracking-widest text-sm">✓ Terms Sealed</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(216,202,163,0.75)' }}>
                  Settlement submitted. Payout: {formatWeiDisplay(executionRecord.payout_sent_wei)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(216,202,163,0.5)' }}>
                  Submit tx: {executionRecord.tx_hash ? `${executionRecord.tx_hash.slice(0,12)}…` : 'pending'}
                </p>
                {executionRecord.input_tx_hash && (
                  <p className="text-xs" style={{ color: 'rgba(216,202,163,0.5)' }}>
                    Accept tx: {executionRecord.input_tx_hash.slice(0,12)}…
                  </p>
                )}
              </div>
            )}

            {/* On-chain seller acceptance panel — shown after merchant submits offer */}
            {executionRecord && dealOffer && sellerAddress && (
              <div className="rounded-panel border px-4 py-3 my-3 space-y-2"
                style={{ borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(18,14,5,0.6)' }}>
                <p className="text-emerald-300 font-bold uppercase tracking-widest text-sm">⚓ Settlement In Progress</p>
                <p className="text-xs" style={{ color: 'rgba(216,202,163,0.75)' }}>
                  Before accepting, the seller must approve the merchant wallet for the input token in their own wallet (standard ERC-20 approve). No action needed in this panel — the merchant settlement runs automatically.
                </p>
                <dl className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-xs tavern-muted">Settlement tx</dt>
                    <dd className="max-w-[12rem] truncate text-xs text-onSurface">{executionRecord.tx_hash ?? 'pending'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-xs tavern-muted">Deal state</dt>
                    <dd className="max-w-[12rem] truncate text-xs text-onSurface">{executionRecord.state}</dd>
                  </div>
                </dl>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input Bar — quill on parchment */}
          <div className="mt-5 flex items-end gap-3 border-t pt-4" style={{ borderColor: 'rgba(196,168,112,0.25)' }}>
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="State your offer or ask…"
                rows={2}
                className="tavern-quill-input"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.3) transparent' }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || typing.active}
              className="tavern-send-btn"
            >
              Send
            </button>
          </div>
        </div>

        {/* Negotiation state sidebar — ledger style */}
        <aside className="negotiation-sidebar text-sm text-onSurface xl:self-start">
          <p className="tavern-muted">Negotiation State</p>
          {negotiationState ? (
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="tavern-muted">Token</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.token}</dd>
              </div>
              <div>
                <dt className="tavern-muted">Amount</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.amount}</dd>
              </div>
              <div>
                <dt className="tavern-muted">Seller Ask</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.seller_ask}</dd>
              </div>
              <div>
                <dt className="tavern-muted">Urgency</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.urgency}</dd>
              </div>
              <div>
                <dt className="tavern-muted">Merchant Stance</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.merchant_stance}</dd>
              </div>
              <div>
                <dt className="tavern-muted">Next Action</dt>
                <dd className="mt-1 text-base text-onSurface">{negotiationState.next_action}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 leading-relaxed tavern-body-text">
              No structured negotiation state yet. Send a seller message and the merchant will start filling this in.
            </p>
          )}

          {/* Quote summary in sidebar */}
          {activeQuote && !executionRecord && (
            <div className="mt-6 border-t pt-4" style={{ borderColor: 'rgba(196,168,112,0.25)' }}>
              <p className="tavern-muted">Active Quote</p>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <dt className="tavern-muted">Payout</dt>
                  <dd className="text-xs text-onSurface">
                    {formatPayoutDisplay(activeQuote.payout_amount, activeQuote.payout_token)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="tavern-muted">Expiry</dt>
                  <dd className="text-xs text-onSurface">{activeQuote.expiry || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="tavern-muted">Status</dt>
                  <dd className="text-xs" style={{ color: 'var(--amber)' }}>{activeQuote.status}</dd>
                </div>
              </dl>
            </div>
          )}

          {executionRecord && (
            <div className="mt-6 border-t pt-4" style={{ borderColor: 'rgba(196,168,112,0.25)' }}>
              <p className="tavern-muted">Settlement</p>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between gap-3">
                  <dt className="tavern-muted">Chain</dt>
                  <dd className="text-xs text-onSurface">Base Sepolia</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="tavern-muted">State</dt>
                  <dd className="text-xs text-onSurface">{executionRecord.state}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="tavern-muted">Tx</dt>
                  <dd className="max-w-[10rem] truncate text-xs text-onSurface">{executionRecord.tx_hash ?? 'pending'}</dd>
                </div>
                {executionRecord.input_tx_hash && (
                  <div className="flex justify-between gap-3">
                    <dt className="tavern-muted">Accept tx</dt>
                    <dd className="max-w-[10rem] truncate text-xs text-onSurface">{executionRecord.input_tx_hash}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="tavern-muted">Payout sent</dt>
                  <dd className="text-xs text-onSurface">{formatWeiDisplay(executionRecord.payout_sent_wei)}</dd>
                </div>
                {executionRecord.error_message && (
                  <div className="space-y-1">
                    <dt className="tavern-muted">Error</dt>
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
