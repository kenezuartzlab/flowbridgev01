import { useQuery } from '@tanstack/react-query';
import type { RewardPolicyPresentation } from './rewardPolicyPresentation';

export function useRewardPolicy() {
  return useQuery({
    queryKey: ['approved-reward-policy'],
    staleTime: 60_000,
    queryFn: async (): Promise<RewardPolicyPresentation> => {
      const response = await fetch('/api/public/reward-policy');
      if (!response.ok) throw new Error('Approved reward policy is unavailable.');
      return response.json();
    },
  });
}