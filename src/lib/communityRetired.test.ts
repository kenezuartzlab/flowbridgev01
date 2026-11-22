import { describe, expect, it } from 'vitest';
import { communityRetiredResponse } from './communityRetired';

describe('disabled community contribution and proposals', () => {
  it('denies access rather than accepting or returning proposal records', async () => {
    const response = communityRetiredResponse();
    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).not.toHaveProperty('proposals');
  });
});