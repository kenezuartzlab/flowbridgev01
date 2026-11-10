export const QUESTS = [
  { id: 'email', title: 'Verify your email', detail: 'One-time account milestone.', href: '/account', once: true },
  { id: 'binding', title: 'Verify & bind your wallet', detail: 'Your first permanent signed binding. Connecting alone does not count.', href: '/account', once: true },
  { id: 'basics', title: 'Learn BOT basics', detail: 'Read the lesson, then answer three questions.', href: '/learn', once: false },
  { id: 'ecosystem', title: 'Explore the ecosystem', detail: 'Discover partners and complete an independent knowledge check.', href: '/discover', once: false },
  { id: 'safety', title: 'Build wallet confidence', detail: 'A daily safety check. No transaction needed.', href: '/learn', once: false },
  { id: 'swap', title: 'One genuine Mainnet swap', detail: 'Optional. Only an independently verified eligible CORE_SWAP counts; no repeat-volume target.', href: '/trade', once: false },
  { id: 'referral', title: 'Welcome a genuine friend', detail: 'Optional. Existing once-only verified referral evidence; no extra FLOW Points.', href: '/earn', once: false },
  { id: 'campaign', title: 'Join a verified campaign', detail: 'Optional. Campaign Studio activity evidence, not clicks or video views.', href: '/campaigns', once: false },
] as const;
export type Topic = 'basics' | 'ecosystem' | 'safety';
export const LESSONS: Record<Topic, { text: string; questions: { prompt: string; options: string[] }[] }> = {
  basics: { text: 'BOT is used for network gas. Mainnet activity is real; Testnet is for practice. Adventure achievements are cosmetic and never convert into FLOW.', questions: [
    { prompt: 'What pays BOT Chain gas?', options: ['Adventure badges', 'BOT', 'Email verification'] },
    { prompt: 'What is Testnet for?', options: ['Practice', 'Guaranteed profit', 'Redeeming badges'] },
    { prompt: 'Can Adventure badges become FLOW?', options: ['Always', 'After a streak', 'Never'] },
  ] },
  ecosystem: { text: 'Partner discovery introduces real products, not guaranteed returns. Read the published rules before joining any campaign. A video view, like or subscription never earns an Adventure achievement.', questions: [
    { prompt: 'What does partner discovery guarantee?', options: ['Profit', 'Token rewards', 'Neither'] },
    { prompt: 'Before joining a campaign, check…', options: ['Click count', 'Published rules', 'Hidden odds'] },
    { prompt: 'Does watching a video earn a badge?', options: ['No', 'Yes', 'Only on Mainnet'] },
  ] },
  safety: { text: 'Keep your seed phrase private. Connecting a wallet is not proof of account ownership. Review the network and full destination address before signing a transaction.', questions: [
    { prompt: 'Who should receive your seed phrase?', options: ['Nobody', 'A campaign', 'A support chat'] },
    { prompt: 'Does connecting prove your permanent identity?', options: ['Yes', 'On Mainnet only', 'No'] },
    { prompt: 'Before signing, review…', options: ['Badge color', 'Network and full address', 'Your streak'] },
  ] },
};
export interface Completion { quest_id: string; period_id: string; completed_at: string }
export interface AdventureState { day: string; week: string; now: string; completions: Completion[] }
export function progress(state: AdventureState) {
  const real = state.completions.filter(c => QUESTS.some(q => q.id === c.quest_id));
  const today = new Set(real.filter(c => c.completed_at.slice(0, 10) === state.day).map(c => c.quest_id));
  const weekly = new Set(real.filter(c => c.completed_at.slice(0, 10) >= state.week && c.completed_at <= state.now).map(c => c.quest_id));
  const days = new Set(state.completions.filter(c => c.quest_id === 'daily_badge').map(c => c.period_id));
  let streak = 0;
  const cursor = new Date(`${state.day}T00:00:00Z`);
  if (!days.has(state.day)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return { today: today.size, weekly: weekly.size, dailyUnlocked: today.size >= 3, weeklyUnlocked: weekly.size >= 5, streak };
}
export const DAILY_REWARD = 'BOT Explorer badge';
export const WEEKLY_REWARD = 'Community Pathfinder badge';