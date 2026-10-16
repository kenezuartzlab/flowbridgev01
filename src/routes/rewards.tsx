import { createFileRoute } from '@tanstack/react-router';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { BottomNav } from '@/components/nav/BottomNav';
import { RewardsExperience } from '@/components/rewards/RewardsExperience';

export const Route = createFileRoute('/rewards')({
  head: () => ({ meta: [
    { title: 'FLOW Rewards & Referrals — FlowBridge' },
    { name: 'description', content: 'Recorded FLOW Points, verified funded rewards, referral evidence and live on-chain payout eligibility.' },
    { property: 'og:title', content: 'FLOW Rewards & Referrals — FlowBridge' },
    { property: 'og:description', content: 'Understand your Points, funding, referrals and verified FLOW claim windows.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: RewardsRoute,
});
function RewardsRoute() {
  return <WagmiProvider config={wagmiConfig}><main className="mx-auto min-h-screen max-w-3xl px-4 py-6 pb-32"><RewardsExperience /></main><BottomNav /></WagmiProvider>;
}
