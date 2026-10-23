import { z } from 'zod';

export const PROPOSAL_LIMITS = Object.freeze({ title: 100, body: 1000, titleBytes: 400, bodyBytes: 4000, requestBytes: 8192 });
const bounded = (max: number, bytes: number) => z.string().trim().min(1).max(max).refine(v => new TextEncoder().encode(v).byteLength <= bytes, 'Content exceeds UTF-8 byte limit');
// Existing proposals use category as their title; keep their public schema intact.
export const proposalSchema = z.object({ category: bounded(PROPOSAL_LIMITS.title, PROPOSAL_LIMITS.titleBytes), text: bounded(PROPOSAL_LIMITS.body, PROPOSAL_LIMITS.bodyBytes) });

export async function readProposalInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing proposal');
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > PROPOSAL_LIMITS.requestBytes) { await reader.cancel(); throw new Error('Proposal request too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return proposalSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}