import { describe, it, expect } from 'vitest';
import { announcementLink, announcementSessionKey, DEFAULT_ANNOUNCEMENT } from './announcement';

describe('visitor announcement', () => {
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