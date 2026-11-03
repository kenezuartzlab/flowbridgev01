import { useState, useEffect } from 'react';
import { Copy, Check, Clipboard, Wallet, Pencil, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { TransactionModalFrame } from './TransactionModalFrame';
import { Button } from '@/components/ui/button';
import { bridgeDestinationReview } from '@/lib/bridge/destinationSafety';

interface ConfirmDestinationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmedAddress: string) => void;
  initialAddress: string;
  connectedWallet?: string;
  payAmount?: string; receiveAmount?: string; fromChain?: string; toChain?: string; bridgeFee?: string; confirmDisabled?: boolean;
}

export function ConfirmDestinationModal({
  isOpen,
  onClose,
  onConfirm,
  initialAddress, connectedWallet, payAmount, receiveAmount, fromChain, toChain, bridgeFee, confirmDisabled = false
}: ConfirmDestinationModalProps) {
  const [address, setAddress] = useState(initialAddress);
  const [copied, setCopied] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [acknowledged, setAcknowledged] = useState('');
  const review = bridgeDestinationReview(address, connectedWallet, acknowledged);

  const updateAddress = (value: string) => {
    setAddress(value);
    setAcknowledged('');
    setAddressError(null);
  };

  useEffect(() => {
    setAddress(initialAddress);
    setEditing(false);
    setAcknowledged('');
    setAddressError(null);
  }, [initialAddress, connectedWallet, isOpen]);

  if (!isOpen) return null;

  // Simple Hex verification check
  const handleValidateAndConfirm = () => {
    if (!review.canConfirm) {
      setAddressError(review.valid ? 'Confirm the different destination below before proceeding.' : 'Enter a valid, non-zero EVM destination address.');
      return;
    }
    setAddressError(null);
    onConfirm(review.recipient);
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
        updateAddress(text.trim());
      }
    } catch (err) {
      // Browser permissions can sometimes restrict direct paste; allow editing as fallback
      setAddressError('Clipboard unavailable. Paste or type the address into the field.');
    }
  };

  return (
    <TransactionModalFrame id="confirm_address_modal" title="Review bridge" onClose={onClose}
      footer={<Button disabled={confirmDisabled || !review.canConfirm} onClick={handleValidateAndConfirm} className="w-full h-11 font-bold">Confirm bridge</Button>}>
        {payAmount != null && <div className="text-xs space-y-1 font-mono">
          <p>Pay: <strong>{payAmount} USDT</strong> · {fromChain}</p>
          <p>Receive (estimated): <strong>{receiveAmount} USDT</strong> · {toChain}</p>
          <p>Bridge Fee: {bridgeFee}</p>
          <p className="text-warning">Origin approval is not destination delivery. Gas is charged separately by your wallet.</p>
        </div>}
        {/* Address Input Section */}
        <div className="space-y-2">
          <label htmlFor="bridge-destination" className="text-[12px] font-bold text-muted font-mono block text-left">
            Destination on {toChain ?? 'receiving network'}
          </label>
          <p className="text-xs text-muted flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 shrink-0" />{review.different ? 'Different destination' : 'Connected wallet (default)'}</p>
          <div className="relative flex items-center bg-background rounded-lg border border-hairline p-1 group focus-within:border-primary/50 transition-colors">
            <input 
              id="bridge-destination"
              type="text" 
              value={address}
              readOnly={!editing}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => updateAddress(e.target.value)}
              placeholder="0x..."
              className="bg-transparent text-[13px] font-mono font-bold text-foreground w-full py-2.5 px-3 focus:outline-none placeholder:text-muted-soft overflow-x-auto"
            />
            
            {/* Action buttons inside input box */}
            <div className="flex items-center gap-1.5 pr-2">
              {editing && <Button 
                type="button"
                onClick={handlePaste}
                title="Paste from clipboard"
                variant="ghost" size="icon" aria-label="Paste destination address"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </Button>}
              <Button 
                type="button"
                onClick={copyToClipboard}
                title="Copy destination"
                variant="ghost" size="icon" aria-label="Copy destination address"
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
            <p role="alert" className="text-[12px] text-danger font-medium text-left pt-0.5">
              {addressError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Use another address</Button>}
            {(editing || review.different) && <Button variant="ghost" size="sm" disabled={!connectedWallet} onClick={() => { updateAddress(connectedWallet ?? ''); setEditing(false); }}><Wallet className="h-3.5 w-3.5" />Use connected wallet</Button>}
          </div>
        </div>
        {review.different && <div role="status" aria-live="polite" className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning"><AlertTriangle className="h-4 w-4 shrink-0" />Sending to a different wallet</p>
          <p className="text-xs text-foreground">USDT will be sent to this address on {toChain ?? 'the receiving network'}, not your connected wallet.</p>
          <p className="text-xs font-mono break-all text-foreground">{review.recipient}</p>
          <p className="text-xs text-muted">Check the full address and network. Transfers cannot be undone.</p>
          {review.valid && <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={acknowledged === review.key} onChange={e => setAcknowledged(e.target.checked ? review.key : '')} />
            <span>I confirm this different destination is correct.</span>
          </label>}
        </div>}
    </TransactionModalFrame>
  );
}
