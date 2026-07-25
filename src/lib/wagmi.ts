import { http, createConfig, createStorage } from 'wagmi';
import { defineChain } from 'viem';
import { injected, walletConnect } from 'wagmi/connectors';

// WalletConnect / Reown project ID. Publishable identifier — safe in client
// bundles. Override via VITE_WC_PROJECT_ID if you rotate the project.
export const WC_PROJECT_ID =
  (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ||
  '897ce6d41cd79776da9af08fb89424c6';

// Detect embedded dApp browsers (TokenPocket, MetaMask, Trust, etc). Those
// already inject a wallet — offering WalletConnect there is confusing and
// can double-open modals, so we skip registering the WC connector inside
// them. Regular mobile / desktop browsers get WalletConnect as a QR / deep
// link option so users without an injected wallet can still connect.
const isInAppWebView = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /TokenPocket|MetaMask|Trust\/|TrustWallet|CoinbaseWallet|CBWallet|imToken|SafePal|BitKeep|Bitget|OKApp|OKEx|MathWallet|Telegram|Instagram|FBAN|FBAV|FB_IAB|Line\/|MicroMessenger|TikTok|; wv\)/i.test(ua);
};

export const isWalletConnectAvailable = typeof window !== 'undefined' && !isInAppWebView();


export const botMainnet = defineChain({
  id: 677,
  name: 'BOT Chain Mainnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.botchain.ai'] },
  },
  blockExplorers: {
    default: { name: 'BOT Explorer', url: 'https://scan.botchain.ai' },
  },
  testnet: false,
});

export const bscMainnet = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: { http: ['https://bsc-dataseed.binance.org/'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
  testnet: false,
});

export const botTestnet = defineChain({
  id: 968,
  name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'tBOT', symbol: 'tBOT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.bohr.life'] }, 
  },
  blockExplorers: {
    default: { name: 'BOT Explorer', url: 'https://scan.bohr.life' },
  },
  testnet: true,
});

export const bscTestnet = defineChain({
  id: 97,
  name: 'BNB Smart Chain Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'tBNB',
  },
  rpcUrls: {
    default: { http: ['https://data-seed-prebsc-1-s1.binance.org:8545'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
  },
  testnet: true,
});

export const ethereum = defineChain({
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://eth.llamarpc.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
  testnet: false,
});

export const sepolia = defineChain({
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
  },
  testnet: true,
});

export const polygon = defineChain({
  id: 137,
  name: 'Polygon',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://polygon-rpc.com'] },
  },
  blockExplorers: {
    default: { name: 'PolygonScan', url: 'https://polygonscan.com' },
  },
  testnet: false,
});

export const wagmiConfig = createConfig({
  chains: [botMainnet, bscMainnet, botTestnet, bscTestnet, ethereum, sepolia],
  storage: createStorage({
    key: 'flowbridge.wallet',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
  connectors: [
    injected({ unstable_shimAsyncInject: 2_000 }),
    ...(isWalletConnectAvailable
      ? [
          walletConnect({
            projectId: WC_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: 'FlowBridge',
              description: 'FlowBridge — BOT Chain swap & bridge gateway',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://flowbridge.space',
              icons: ['https://flowbridge.space/favicon.ico'],
            },
          }),
        ]
      : []),
  ],

  transports: {
    [botMainnet.id]: http(),
    [bscMainnet.id]: http(),
    [botTestnet.id]: http(),
    [bscTestnet.id]: http(),
    [ethereum.id]: http(),
    [sepolia.id]: http(),
  },
});

