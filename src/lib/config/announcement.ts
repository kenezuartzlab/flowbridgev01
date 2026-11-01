import votingGuide from '@/assets/flowbridge-voting-guide.png.asset.json';

export const DEFAULT_ANNOUNCEMENT = {
  title: 'Voting made simple',
  href: '/ecosystem-ranking',
  imageUrl: votingGuide.url,
  ctaLabel: 'Vote for FlowBridge',
};

/** Only local app paths or secure web links may be published. */
export function announcementLink(value: string): string {
  const link = value.trim();
  if (link.startsWith('/') && !link.startsWith('//') && !link.includes('\\')) return link;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function announcementSessionKey(title: string, href: string, image: string): string {
  return `flowbridge-announcement:${JSON.stringify([title, href, image])}`;
}