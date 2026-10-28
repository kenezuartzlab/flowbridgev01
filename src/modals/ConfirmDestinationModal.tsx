import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Clipboard } from 'lucide-react';
import { cn } from '../lib/utils';
import { TransactionModalFrame } from './TransactionModalFrame';
import { Button } from '@/components/ui/button';

interface ConfirmDestinationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmedAddress: string) => void;
  initialAddress: string;
}

export function ConfirmDestinationModal({
  isOpen,
  onClose,
  onConfirm,
  initialAddress
}: ConfirmDestinationModalProps) {
  const [address, setAddress] = useState(initialAddress);
  const [copied, setCopied] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    setAddress(initialAddress);
  }, [initialAddress]);

  if (!isOpen) return null;

  // Simple Hex verification check
  const handleValidateAndConfirm = () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setAddressError("Destination address cannot be empty.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setAddressError("Please enter a valid EVM address (must start with 0x followed by 40 hex characters).");
      return;
    }
    setAddressError(null);
    onConfirm(trimmed);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy address", err);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAddress(text.trim());
      }
    } catch (err) {
      // Browser permissions can sometimes restrict direct paste; allow editing as fallback
      console.warn("Clipboard read restricted", err);
    }
  };

  return (
    <TransactionModalFrame id="confirm_address_modal" title="Confirm transaction" onClose={onClose}
      footer={<Button onClick={handleValidateAndConfirm} className="w-full h-11 font-bold">Confirm</Button>}>
        {/* Warning Banner block - Matching page 4 exactly */}
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 text-left">
          <p className="text-[13px] leading-relaxed font-semibold text-primary">
            Please ensure the destination address below is correct before proceeding
          </p>
        </div>

        {/* Address Input Section */}
        <div className="space-y-2">
          <label className="text-[12px] font-bold text-muted uppercase tracking-wider font-mono block text-left">
            Destination address
          </label>
          <div className="relative flex items-center bg-background rounded-xl border border-hairline p-1 group focus-within:border-primary/50 transition-colors">
            <input 
              type="text" 
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (addressError) setAddressError(null);
              }}
              placeholder="0x..."
              className="bg-transparent text-[13px] font-mono font-bold text-foreground w-full py-2.5 px-3 focus:outline-none placeholder:text-muted-soft overflow-x-auto"
            />
            
            {/* Action buttons inside input box */}
            <div className="flex items-center gap-1.5 pr-2">
              <Button 
                type="button"
                onClick={handlePaste}
                title="Paste from clipboard"
                className="p-1.5 bg-card text-muted hover:text-primary rounded-lg border border-hairline hover:border-primary/20 transition-all cursor-pointer active:scale-90"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </Button>
              <Button 
                type="button"
                onClick={copyToClipboard}
                title="Copy destination"
                className={cn(
                  "p-1.5 rounded-lg border transition-all cursor-pointer active:scale-90",
                  copied 
                    ? "bg-primary/10 text-primary border-primary/20 animate-none" 
                    : "bg-card text-muted hover:text-primary border-hairline hover:border-primary/20"
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          {addressError && (
            <p className="text-[12px] text-red-400 font-medium text-left pt-0.5">
              {addressError}
            </p>
          )}
        </div>

    </TransactionModalFrame>
  );
}
