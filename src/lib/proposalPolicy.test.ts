import { describe, expect, it } from 'vitest';
import { proposalSchema, readProposalInput, PROPOSAL_LIMITS } from './proposalPolicy';
describe('proposal content boundaries', () => {
  it('accepts an existing legitimate proposal', () => expect(proposalSchema.parse({category:'Feature',text:'Add a community board'}).text).toBe('Add a community board'));
  it('rejects oversized category titles', () => expect(proposalSchema.safeParse({category:'a'.repeat(PROPOSAL_LIMITS.title+1),text:'Valid'}).success).toBe(false));
  it('rejects oversized bodies before writing', () => expect(proposalSchema.safeParse({category:'Feature',text:'a'.repeat(PROPOSAL_LIMITS.body+1)}).success).toBe(false));
  it('rejects oversized UTF-8 request payloads', async () => {
    await expect(readProposalInput(new Request('http://localhost/api/proposals',{method:'POST',body:JSON.stringify({category:'Feature',text:'Valid',extra:'🧩'.repeat(3000)})}))).rejects.toThrow('too large');
  });
  it('never accepts client authorship as authority', () => expect(proposalSchema.parse({category:'Feature',text:'Valid',author:'Spoofed'})).not.toHaveProperty('author'));
});