import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';

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

export const wagmiConfig = createConfig({
  chains: [botMainnet, bscMainnet, botTestnet, bscTestnet],
  connectors: [
    injected(),
  ],
  transports: {
    [botMainnet.id]: http(),
    [bscMainnet.id]: http(),
    [botTestnet.id]: http(),
    [bscTestnet.id]: http(),
  },
});
