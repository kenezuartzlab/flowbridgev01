import { useState } from 'react';
import yellow from '@/assets/bnb-chain-symbol-yellow.svg.asset.json';
import black from '@/assets/bnb-chain-symbol-black.svg.asset.json';
import { cn } from '@/lib/utils';

/** Unmodified first-party symbols. Official monochrome variant supplies light-theme contrast. */
export function BnbChainMark({ size = 16, className }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const px = Math.max(15, size);
  return <span role="img" aria-label="BNB Chain" data-bnb-chain="56" className={cn('bnb-chain-symbol inline-grid shrink-0 place-items-center', className)} style={{ width: px, height: px }}>
    {failed ? <span className="text-[8px] font-bold text-foreground" aria-hidden>BNB</span> : <>
      <img src={yellow.url} alt="" aria-hidden width={px} height={px} className="bnb-symbol-yellow h-full w-full object-contain" onError={() => setFailed(true)} />
      <img src={black.url} alt="" aria-hidden width={px} height={px} className="bnb-symbol-black h-full w-full object-contain" onError={() => setFailed(true)} />
    </>}
  </span>;
}