import { runDeliberation, resetDeliberationCache } from "../lib/ai/federation/deliberationRouter.server";
const actor = { userId: "0d440b2f-be0f-4c94-9c88-274b04967746", email: "blackwidowscars@gmail.com", orgIds: [], isInternalOperator: false } as any;
resetDeliberationCache();
const deg = await runDeliberation({
  actor, question: "Should I stake FLOW now or claim rewards first?",
  requestedCapabilityKinds: ["GENERAL_ANALYSIS"], requestId: "v21-degraded",
  walletAddress: "0x4eda967f84c2aa6cfcd677683e49ce02d165d887",
  mockControls: { "bot.mock.analytics": { timeout: true } as any },
  useCache: false,
});
console.log(JSON.stringify({ status: deg.status, degraded: deg.degraded,
  sources: deg.selectedSkills.map(s=>({s:s.skillId,ok:s.ok,rc:s.resultClass,ms:s.latencyMs,notice:s.degradedNotice})),
  compared: deg.comparedSourceCount, candidate: deg.candidateOpportunityKind,
  missions: deg.missionsCreated, intents: deg.directExternalActionIntents, txs: deg.blockchainTransactions, executed: deg.executed,
  summary: deg.recommendationSummary }, null, 1));
