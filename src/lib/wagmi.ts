import { http, createConfig, createStorage } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { botMainnet, bscMainnet, botTestnet, bscTestnet, ethereum, sepolia } from './chains';

export { botMainnet, bscMainnet, botTestnet, bscTestnet, ethereum, sepolia } from './chains';

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

