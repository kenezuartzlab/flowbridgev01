/** Contribution and community proposal access is disabled; history is retained. */
export function communityRetiredResponse(): Response {
  return Response.json({ error: 'Contributions and community proposals are disabled.' }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
}