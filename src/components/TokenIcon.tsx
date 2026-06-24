import React from 'react';
import { Coins } from 'lucide-react';
import { cn } from '../lib/utils';

interface TokenIconProps {
  symbol: string;
  size?: number; // width & height in pixels (default: 24)
  className?: string;
}

export function TokenIcon({ symbol, size = 24, className }: TokenIconProps) {
  const normSymbol = symbol.trim().toUpperCase();
  const id = React.useId();

  const [caSrc, setCaSrc] = React.useState('/carypact-logo.png');
  const [botSrc, setBotSrc] = React.useState('/bot-icon.png');

  // 1. CARY (CA) Token Icon - Elegant original PNG with instant SVG fallback
  if (normSymbol === 'CA') {
    return (
      <img
        src={caSrc}
        width={size}
        height={size}
        alt="CaryPact Logo"
        className={cn("select-none shrink-0 drop-shadow-sm pointer-events-none object-contain", className)}
        referrerPolicy="no-referrer"
        onError={() => {
          if (caSrc !== '/carypact-logo.svg') {
            setCaSrc('/carypact-logo.svg');
          }
        }}
      />
    );
  }

  // 2. BOT Token Icon - Elegant original PNG with instant SVG fallback
  if (normSymbol === 'BOT' || normSymbol === 'WBOT' || normSymbol === 'CAWBOT') {
    return (
      <img
        src={botSrc}
        width={size}
        height={size}
        alt="BOT Icon"
        className={cn("select-none shrink-0 drop-shadow-sm pointer-events-none object-contain", className)}
        referrerPolicy="no-referrer"
        onError={() => {
          if (botSrc !== '/bot-icon.svg') {
            setBotSrc('/bot-icon.svg');
          }
        }}
      />
    );
  }

  // 3. USDT Token Icon - Reverted to the clean, original solid circular green-teal badge containing the white ₮ symbol
  if (normSymbol === 'USDT') {
    return (
      <div 
        className={cn(
          "rounded-full bg-teal-500 text-white flex items-center justify-center font-bold shadow-sm border border-teal-300 select-none shrink-0", 
          className
        )}
        style={{ 
          width: `${size}px`, 
          height: `${size}px`, 
          fontSize: `${Math.floor(size * 0.55)}px`,
          lineHeight: 1
        }}
      >
        ₮
      </div>
    );
  }

  // Standard generic fallback coins (e.g. BTC, generic chain)
  return (
    <div 
      className={cn("rounded-full bg-amber-500 text-white flex items-center justify-center font-black shadow border border-amber-400 select-none", className)}
      style={{ width: size, height: size, fontSize: Math.floor(size * 0.45) }}
    >
      <Coins className="w-1/2 h-1/2" />
    </div>
  );
}
