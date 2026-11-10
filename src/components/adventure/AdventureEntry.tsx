import { Link } from '@tanstack/react-router';
import { Compass, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { adventureRequest } from '@/lib/adventure/api';
import type { AdventureState } from '@/lib/adventure/catalog';
export function AdventureEntry() {
  const { data } = useQuery({ queryKey:['adventure'], queryFn:()=>adventureRequest<AdventureState>(), retry:false, staleTime:60000 });
  if (!data) return null;
  return <Button asChild variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal border-y border-hairline py-3 text-left"><Link to="/adventure"><Compass className="text-primary"/><span className="min-w-0 flex-1"><span className="block font-semibold">Adventure <span className="text-xs font-normal text-muted">· Preview</span></span><span className="block text-xs text-muted">Daily discovery. Guaranteed badges.</span></span><ArrowRight/></Link></Button>;
}