import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalPortal } from './ModalPortal';

/** Pin actions outside the scroller; visualViewport includes keyboard/browser chrome. */
export function TransactionModalFrame({ id, title, onClose, children, footer }: {
  id: string; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      layer.current?.style.setProperty('--transaction-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      layer.current?.style.setProperty('--transaction-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return <ModalPortal><div ref={node => {
    layer.current = node;
    if (node) {
      node.style.setProperty('--transaction-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
      node.style.setProperty('--transaction-viewport-top', `${window.visualViewport?.offsetTop ?? 0}px`);
    }
  }} className="transaction-modal-layer bg-background/92 backdrop-blur-md">
    <section id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="transaction-modal-frame border border-hairline bg-card text-foreground shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <h2 id={`${id}-title`} className="text-sm font-bold font-mono uppercase">{title}</h2>
        <Button variant="ghost" size="icon" aria-label={`Close ${title}`} onClick={onClose}><X /></Button>
      </header>
      <div className="transaction-modal-body space-y-3 p-3">{children}</div>
      {footer && <footer className="transaction-modal-footer border-t border-hairline bg-card p-3">{footer}</footer>}
    </section>
  </div></ModalPortal>;
}