/** Group presentation only; authoritative acceptance remains in the live RPC. */
export type GroupRecord = { id: string; points: number; assessment?: { exceptionAllowed: boolean; condition: string }; review: { group_id?: string | null; canDecide: boolean } | null };
export function groupedReviewState(records: GroupRecord[], expectedIds: string[]) {
  const selected = records.filter(r => expectedIds.includes(r.id));
  const complete = expectedIds.length > 0 && new Set(expectedIds).size === expectedIds.length && selected.length === expectedIds.length;
  const groupIds = new Set(selected.map(r => r.review?.group_id).filter((id): id is string => !!id));
  const shared = new Set(selected.map(r => r.assessment?.condition)).size === 1;
  return {
    records: selected, points: selected.reduce((s,r) => s + r.points, 0),
    canPropose: complete && shared && selected.every(r => r.assessment?.exceptionAllowed && !r.review),
    groupId: complete && groupIds.size === 1 && selected.every(r => r.review?.group_id) ? [...groupIds][0] : undefined,
    canApprove: complete && shared && groupIds.size === 1 && selected.every(r => r.assessment?.exceptionAllowed && r.review?.group_id && r.review.canDecide),
  };
}