import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ArrowUpRight, Vote } from 'lucide-react';
import { useAppConfig } from '@/lib/config/appConfig';
import { announcementLink, announcementSessionKey } from '@/lib/config/announcement';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function VisitorAnnouncement() {
  const { content } = useAppConfig();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const href = announcementLink(content.announcementHref);
  const image = announcementLink(content.announcementImageUrl);
  const key = announcementSessionKey(content.announcement, href, image);
  const excluded = pathname.startsWith('/ops') || pathname.startsWith('/sets') || pathname === '/ecosystem-ranking';
  const visible = content.announcementEnabled && !!href && !excluded;

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    if (!hydrated || !visible || !content.announcementPopup) { setOpen(false); return; }
    try { setOpen(sessionStorage.getItem(key) !== 'seen'); }
    catch { setOpen(true); }
  }, [hydrated, visible, content.announcementPopup, key]);

  const dismiss = () => {
    setOpen(false);
    try { sessionStorage.setItem(key, 'seen'); } catch { /* Optional preference only. */ }
  };
  if (!visible || !hydrated) return null;
  const cta = (className?: string) => (
    <Button asChild className={className}>
      <a href={href} onClick={dismiss}>{content.announcementCtaLabel}<ArrowUpRight /></a>
    </Button>
  );
  return (
    <>
      <aside aria-label="Announcement" className="border-b border-primary/25 bg-card px-3 py-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <Vote className="size-5 shrink-0 text-primary" />
            <span className="break-words">{content.announcement}</span>
          </div>
          {cta('h-8 shrink-0 px-3 text-xs')}
        </div>
      </aside>
      <Dialog open={open} onOpenChange={next => { if (!next) dismiss(); }}>
        <DialogContent className="flex max-h-[94dvh] w-[calc(100%-24px)] max-w-md flex-col gap-3 overflow-y-auto rounded-lg p-3 pt-10">
          <DialogTitle className="text-center">{content.announcement}</DialogTitle>
          <DialogDescription className="sr-only">FlowBridge community announcement</DialogDescription>
          {image && <a href={href} onClick={dismiss} className="min-h-0 shrink overflow-hidden rounded-md"><img src={image} alt="FlowBridge voting announcement" className="mx-auto max-h-[56dvh] w-full object-contain" /></a>}
          {cta('h-11 w-full shrink-0')}
          <Button variant="ghost" className="shrink-0" onClick={dismiss}>Not now</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}