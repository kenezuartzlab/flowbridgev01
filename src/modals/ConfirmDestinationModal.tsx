import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Clipboard } from 'lucide-react';
import { cn } from '../lib/utils';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="confirm_address_modal"
        className="bg-[#0B1521] border border-white/10 text-white rounded-[24px] w-full max-w-[360px] p-6 shadow-2xl relative flex flex-col space-y-5 animate-scale-up"
      >
        {/* Header containing Close Button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-white/95 font-mono uppercase tracking-wide">
            Confirm transaction
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C0C8D0] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner block - Matching page 4 exactly */}
        <div className="bg-[#122A26] border border-[#32FF8B]/15 rounded-xl p-3 text-left">
          <p className="text-[13px] leading-relaxed font-semibold text-[#32FF8B]">
            Please ensure the destination address below is correct before proceeding
          </p>
        </div>

        {/* Address Input Section */}
        <div className="space-y-2">
          <label className="text-[12px] font-bold text-[#C5C1B9] uppercase tracking-wider font-mono block text-left">
            Destination address
          </label>
          <div className="relative flex items-center bg-[#010C1B] rounded-xl border border-white/10 p-1 group focus-within:border-[#32FF8B]/50 transition-colors">
            <input 
              type="text" 
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (addressError) setAddressError(null);
              }}
              placeholder="0x..."
              className="bg-transparent text-[13px] font-mono font-bold text-white w-full py-2.5 px-3 focus:outline-none placeholder:text-white/25 overflow-x-auto"
            />
            
            {/* Action buttons inside input box */}
            <div className="flex items-center gap-1.5 pr-2">
              <button 
                type="button"
                onClick={handlePaste}
                title="Paste from clipboard"
                className="p-1.5 bg-[#0D1C2A] text-[#C5C1B9] hover:text-[#32FF8B] rounded-lg border border-white/5 hover:border-[#32FF8B]/20 transition-all cursor-pointer active:scale-90"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              <button 
                type="button"
                onClick={copyToClipboard}
                title="Copy destination"
                className={cn(
                  "p-1.5 rounded-lg border transition-all cursor-pointer active:scale-90",
                  copied 
                    ? "bg-[#32FF8B]/10 text-[#32FF8B] border-[#32FF8B]/20 animate-none" 
                    : "bg-[#0D1C2A] text-[#C5C1B9] hover:text-[#32FF8B] border-white/5 hover:border-[#32FF8B]/20"
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {addressError && (
            <p className="text-[12px] text-red-400 font-medium text-left pt-0.5">
              {addressError}
            </p>
          )}
        </div>

        {/* Actions - Confirm Button */}
        <button
          onClick={handleValidateAndConfirm}
          className="w-full py-4 rounded-2xl bg-white hover:bg-white/95 text-[#010C1B] font-black text-sm uppercase tracking-widest transition-all duration-150 active:scale-[0.98] shadow-md hover:shadow-white/10 cursor-pointer"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
