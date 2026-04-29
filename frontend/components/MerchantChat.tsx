'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    sender: 'seller',
    text: 'I have 18,000 TIDE to move before the market window closes. Can your house clear it for USDC?',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
  {
    id: '2',
    sender: 'merchant',
    text: 'The harbor is shallow for this cargo. I will quote against executable conditions, not tavern gossip pricing.',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
  {
    id: '3',
    sender: 'merchant',
    text: 'If the lot settles cleanly and slippage holds, I can extend a discounted bid under my current charter.',
    timestamp: new Date(Date.now() - 1000 * 60 * 1).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
];

const MERCHANT_RESPONSES = [
  'The harbor is shallow for this cargo. I will quote against executable conditions, not tavern gossip pricing.',
  'Show me what clears, and I may improve the number.',
  'Too close to rumor price. Reduce my risk, and I improve the payout.',
  'Your number leans too close to rumor-market value. I can improve the payout only if execution risk shrinks.',
  '"State your number plainly."',
  '"Good. We settle before the tide turns."',
  '"Keep your cargo. Return when your timing is honest."',
];

export default function MerchantChat() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [typing, setTyping] = useState<TypingState>({ active: false, text: '', charIndex: 0 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const startMerchantReply = useCallback(() => {
    const response = MERCHANT_RESPONSES[Math.floor(Math.random() * MERCHANT_RESPONSES.length)];
    setTyping({ active: true, text: response, charIndex: 0 });
  }, []);

  // Streaming effect: reveal characters one by one
  useEffect(() => {
    if (!typing.active) return;
    if (typing.charIndex >= typing.text.length) {
      // Done: add message to list
      const newMsg: Message = {
        id: Date.now().toString(),
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
    }, 22);
    return () => clearTimeout(timer);
  }, [typing]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      sender: 'seller',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputValue('');

    // Merchant replies after a short delay
    setTimeout(() => {
      startMerchantReply();
    }, 800);
  }, [inputValue, startMerchantReply]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
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
                  {msg.sender === 'merchant' ? 'Harbormaster ted.eth' : 'You'}
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
                <span className="text-[10px] uppercase tracking-[0.24em] text-onSurfaceVariant">Harbormaster ted.eth</span>
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
            placeholder="State your offer or ask..."
            rows={2}
            className="merchant-inset w-full resize-none rounded-panel border border-outline bg-surfaceLowest px-4 py-3 text-sm text-[#f5e9c9] placeholder:text-[#7a6040] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/60"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.3) transparent' }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || typing.active}
          className="flex h-[3.25rem] items-center justify-center rounded-panel border border-primary bg-transparent px-5 text-sm font-bold uppercase tracking-[0.2em] text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
