/** Permanent tombstone: no authentication, storage read or link generation occurs. */
export function privateSharingRetired(): Response {
  return Response.json({ error: "Private-file sharing has been retired." }, {
    status: 410,
    headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

export const retiredPrivateSharingHandlers = {
  GET: privateSharingRetired,
  HEAD: privateSharingRetired,
  POST: privateSharingRetired,
  PUT: privateSharingRetired,
  PATCH: privateSharingRetired,
  DELETE: privateSharingRetired,
  OPTIONS: privateSharingRetired,
};