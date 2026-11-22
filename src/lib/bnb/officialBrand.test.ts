import { expect,it } from 'vitest';
import symbol from '@/assets/bnb-chain-symbol-yellow.svg.asset.json';
import { logoCandidates,setLogoOverrides } from '@/lib/tokenLogos';
it('BNB and WBNB resolve only to first-party stored artwork, not an admin replacement or external coin',()=>{setLogoOverrides({bnb:'https://example.com/not-bnb.svg',wbnb:'https://example.com/not-bnb.svg'});expect(logoCandidates('BNB')).toEqual([symbol.url]);expect(logoCandidates('WBNB')).toEqual([symbol.url]);setLogoOverrides({});});
it('BOT identity remains separate',()=>{expect(logoCandidates('BOT')).not.toContain(symbol.url);expect(logoCandidates('CA')).not.toContain(symbol.url);});
