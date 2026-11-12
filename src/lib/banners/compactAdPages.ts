/** Explicit inventory: unregistered routes are never eligible, including newly added routes. */
export const COMPACT_AD_PAGES = [
  {id:'home',label:'Home',route:'/home',eligible:true},
  {id:'swap',label:'Swap',route:'/trade · Any pair',eligible:true},
  {id:'bridge',label:'Bridge',route:'/trade · Bridge',eligible:true},
  {id:'cabot',label:'CA/BOT',route:'/trade · CA/BOT',eligible:true},
  {id:'discover',label:'Discover / Explore',route:'/discover',eligible:true},
  {id:'markets',label:'Markets',route:'/markets',eligible:true},
  {id:'earn',label:'Earn',route:'/earn',eligible:true},
  {id:'referrals',label:'Referrals',route:'/earn#referrals',eligible:true},
  {id:'rewards',label:'Rewards',route:'/rewards',eligible:true},
  {id:'staking',label:'Staking',route:'/stake',eligible:true},
  {id:'wallet',label:'Wallet overview',route:'/wallet',eligible:true},
  {id:'profile',label:'Profile overview',route:'/account',eligible:true},
  {id:'learn',label:'Learn',route:'/learn',eligible:true},
  {id:'activity',label:'Activity',route:'/activity',eligible:true},
  {id:'docs',label:'Documentation',route:'/docs',eligible:true},
  {id:'bot-chain',label:'BOT Chain',route:'/bot-chain',eligible:true},
  {id:'launch-blog',label:'Mainnet launch article',route:'/blog/flowbridge-officially-launches-on-bot-chain-mainnet',eligible:true},
  {id:'liquidity',label:'Liquidity overview',route:'/liquidity',eligible:true},
  {id:'ecosystem-ranking',label:'Ecosystem ranking',route:'/ecosystem-ranking',eligible:true},
  {id:'campaigns',label:'Campaign directory',route:'/campaigns',eligible:true},
  {id:'campaign-detail',label:'Public campaign',route:'/campaigns/$slug',eligible:true},
  {id:'campaign-partners',label:'Campaign partners',route:'/campaigns/partners',eligible:true},
  {id:'partners',label:'Partners',route:'/partners',eligible:true},
  {id:'games',label:'Games',route:'/games',eligible:true},
  {id:'adventure',label:'Adventure',route:'/adventure',eligible:true},
  {id:'arcadeflix',label:'ArcadeFlix',route:'/arcadeflix',eligible:true},
  {id:'ecosurge',label:'EcoSurge',route:'/ecosurge',eligible:true},
  {id:'assistant',label:'AI conversations',route:'/assistant',eligible:false},
  {id:'campaign-me',label:'Private campaign submissions',route:'/campaigns/me',eligible:false},
  {id:'campaign-analytics',label:'Campaign analytics',route:'/campaigns/analytics/$id',eligible:false},
  {id:'campaign-studio',label:'Campaign editor',route:'/campaigns/studio',eligible:false},
  {id:'studio',label:'Studio',route:'/studio',eligible:false},
  {id:'admin',label:'Administration',route:'/admin',eligible:false},
  {id:'ops',label:'Operations',route:'/ops',eligible:false},
  {id:'sets',label:'Control panel',route:'/sets',eligible:false},
  {id:'reset-password',label:'Password recovery',route:'/reset-password',eligible:false},
  {id:'multisend',label:'Multisend signing tool',route:'/multisend',eligible:false},
  {id:'fortune',label:'Retired Fortune page',route:'/fortune',eligible:false},
] as const;

export type CompactAdPageId=typeof COMPACT_AD_PAGES[number]['id'];
export const COMPACT_AD_PAGE_IDS=COMPACT_AD_PAGES.map(p=>p.id) as [CompactAdPageId,...CompactAdPageId[]];
export function compactAdPage(path:string,tab:string='BOT/USDT',hash:string=''):CompactAdPageId|null {
  if(path.length>1&&path.endsWith('/'))path=path.slice(0,-1);
  // No prefix fallback: a new route, private descendant or unknown view must stay OFF.
  if(path==='/'||path==='/trade')return tab==='BRIDGE'?'bridge':tab==='CA/BOT'?'cabot':'swap';
  if(path==='/earn'&&hash.replace(/^#/,'')==='referrals')return 'referrals';
  const exact=COMPACT_AD_PAGES.find(p=>p.route===path);
  if(exact)return exact.eligible?exact.id:null;
  if(/^\/campaigns\/[a-zA-Z0-9_-]{1,120}$/.test(path)) {
    if(['me','studio','analytics','admin'].includes(path.split('/')[2]))return null;
    return 'campaign-detail';
  }
  return null;
}