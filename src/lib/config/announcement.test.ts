import { describe, it, expect } from 'vitest';
import { announcementLink, announcementSessionKey, DEFAULT_ANNOUNCEMENT } from './announcement';
import { mergeAppConfig } from './appConfig';

describe('visitor announcement', () => {
  it('activates the voting campaign instead of reusing old login copy', () => {
    expect(mergeAppConfig({ content: { announcement: 'Old signup notice' } }).content.announcement).toBe(DEFAULT_ANNOUNCEMENT.title);
  });
  it('preserves explicit operator removal and replacement', () => {
    const content = mergeAppConfig({ content: { announcementEnabled: false, announcement: 'Updated campaign', announcementHref: '/rewards' } }).content;
    expect(content.announcementEnabled).toBe(false);
    expect(content.announcement).toBe('Updated campaign');
    expect(content.announcementHref).toBe('/rewards');
  });
  it('links voting directly to the in-app voting page', () => {
    expect(DEFAULT_ANNOUNCEMENT.href).toBe('/ecosystem-ranking');
  });
  it('accepts local app and secure artwork links', () => {
    expect(announcementLink('/ecosystem-ranking')).toBe('/ecosystem-ranking');
    expect(announcementLink('https://example.com/image.png')).toBe('https://example.com/image.png');
  });
  it('rejects executable, insecure and disguised external links', () => {
    for (const value of ['javascript:alert(1)', '//example.com', '/\\example.com', 'http://example.com', 'https://user:pass@example.com']) expect(announcementLink(value)).toBe('');
  });
  it('new announcement content has a new dismissal key', () => {
    expect(announcementSessionKey('New', '/ecosystem-ranking', '/image.png')).not.toBe(announcementSessionKey('Old', '/ecosystem-ranking', '/image.png'));
  });
});