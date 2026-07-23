import { ChainNotConfiguredError, ProviderNotFoundError, createConnector } from 'wagmi';
import { getAddress, numberToHex, UserRejectedRequestError, type Chain } from 'viem';

type WalletConnectProvider = {
  accounts: string[];
  chainId: number;
  session?: unknown;
  events?: { setMaxListeners?: (value: number) => void };
  on: (event: string, listener: (...args: any[]) => void) => void;
  removeListener: (event: string, listener: (...args: any[]) => void) => void;
  connect: (params?: Record<string, unknown>) => Promise<void>;
  disconnect: () => Promise<void>;
  enable: () => Promise<string[]>;
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
};

// WalletConnect / Reown project ID. Publishable identifier — safe in client
// bundles. Override via VITE_WC_PROJECT_ID if you rotate the project.
export const WC_PROJECT_ID =
  (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ||
  '897ce6d41cd79776da9af08fb89424c6';

const metadata = {
  name: 'FlowBridge',
  description: 'FlowBridge — BOT Chain swap & bridge gateway',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://flowbridge.space',
  icons: ['https://flowbridge.space/favicon.ico'],
};

const connectedStorageKey = 'flowbridge.walletConnect.connected';
const requestedChainsStorageKey = 'flowbridge.walletConnect.requestedChains';

function sanitizeWalletConnectError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      firstStackLine: error.stack?.split('\n').slice(0, 3).join(' | '),
    };
  }
  return { message: String(error ?? 'Unknown error') };
}

function wcDebug(stage: string, details: Record<string, unknown> = {}) {
  const payload = {
    stage,
    at: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    ...details,
  };
  console.info('[walletconnect:debug]', payload);
}

function wcError(stage: string, error: unknown, details: Record<string, unknown> = {}) {
  console.error('[walletconnect:error]', {
    stage,
    at: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    ...details,
    error: sanitizeWalletConnectError(error),
  });
}

function rpcMapForChains(chains: readonly Chain[]) {
  return Object.fromEntries(
    chains
      .map((chain) => [chain.id, chain.rpcUrls.default.http[0]] as const)
      .filter(([, url]) => Boolean(url)),
  );
}

function isRejected(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(user rejected|connection request reset|user closed|modal closed)/i.test(message);
}

export function flowWalletConnect() {
  let provider_: WalletConnectProvider | undefined;
  let providerPromise: Promise<WalletConnectProvider> | undefined;
  let accountsChanged: ((accounts: string[]) => void) | undefined;
  let chainChanged: ((chainId: any) => void) | undefined;
  let disconnect: ((error?: Error) => void) | undefined;
  let displayUri: ((uri: string) => void) | undefined;
  let sessionDelete: (() => void) | undefined;

  return createConnector((config) => {
    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts.length) handleDisconnect();
      else config.emitter.emit('change', { accounts: accounts.map((account) => getAddress(account)) });
    };

    const handleChainChanged = (chainId: string | number) => {
      config.emitter.emit('change', { chainId: Number(chainId) });
    };

    const handleDisconnect = () => {
      void config.storage?.removeItem(connectedStorageKey);
      void config.storage?.removeItem(requestedChainsStorageKey);
      config.emitter.emit('disconnect');
    };

    const handleDisplayUri = (uri: string) => {
      wcDebug('display_uri_received', {
        uriLength: uri.length,
        startsWithWalletConnect: uri.startsWith('wc:'),
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('flowbridge:walletconnect-uri', { detail: { uri } }));
      }
      config.emitter.emit('message', { type: 'display_uri', data: uri });
    };

    const initProvider = async (): Promise<WalletConnectProvider> => {
      const optionalChains = config.chains.map((chain) => chain.id);
      const rpcMap = rpcMapForChains(config.chains);
      wcDebug('provider_import_start', {
        chains: optionalChains,
        rpcChainIds: Object.keys(rpcMap),
        projectIdSuffix: WC_PROJECT_ID.slice(-6),
      });
      try {
        const providerModule = await import('@walletconnect/ethereum-provider');
        const { EthereumProvider } = providerModule;
        wcDebug('provider_import_success', {
          exportKeys: Object.keys(providerModule).slice(0, 20),
          ethereumProviderType: typeof EthereumProvider,
          initType: typeof EthereumProvider?.init,
        });
        wcDebug('provider_init_start');
        const provider = (await EthereumProvider.init({
          projectId: WC_PROJECT_ID,
          metadata,
          disableProviderPing: true,
          optionalChains: optionalChains as [number, ...number[]],
          rpcMap: rpcMap as any,
          // We render our own QR modal from the provider's `display_uri` event.
          // This avoids Reown/AppKit modal bundle issues in the current Vite
          // stack while keeping the WalletConnect protocol provider intact.
          showQrModal: false,
        })) as WalletConnectProvider;
        provider.events?.setMaxListeners?.(Number.POSITIVE_INFINITY);
        wcDebug('provider_init_success', {
          hasConnect: typeof provider.connect === 'function',
          hasEnable: typeof provider.enable === 'function',
          hasRequest: typeof provider.request === 'function',
          hasEvents: Boolean(provider.events),
          chainId: provider.chainId,
          accountCount: provider.accounts?.length ?? 0,
          hasSession: Boolean(provider.session),
        });
        return provider;
      } catch (error) {
        wcError('provider_import_or_init_failed', error, {
          chains: optionalChains,
          rpcChainIds: Object.keys(rpcMap),
        });
        throw error;
      }
    };

    const getProviderInternal = async (): Promise<WalletConnectProvider> => {
      if (!provider_) {
        wcDebug('provider_get_start', { hasExistingPromise: Boolean(providerPromise) });
        providerPromise ??= initProvider();
        try {
          provider_ = await providerPromise;
        } catch (error) {
          providerPromise = undefined;
          wcError('provider_get_failed', error);
          throw error;
        }
        wcDebug('provider_get_success');
      }
      return provider_;
    };

    const getChainIdInternal = async () => {
      const provider = await getProviderInternal();
      if (provider.chainId) return Number(provider.chainId);
      const hexChainId = await provider.request({ method: 'eth_chainId' });
      return Number(hexChainId);
    };

    const switchChainInternal = async ({ addEthereumChainParameter, chainId }: any) => {
      const provider = await getProviderInternal();
      const chain = config.chains.find((item) => item.id === chainId);
      if (!chain) throw new ChainNotConfiguredError();

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: numberToHex(chainId) }],
        });
        const previousChains = ((await config.storage?.getItem(requestedChainsStorageKey)) ?? []) as number[];
        await config.storage?.setItem(requestedChainsStorageKey, [
          ...new Set([...previousChains, chainId]),
        ]);
        return chain;
      } catch (switchError: any) {
        if (switchError?.code !== 4902 && !/not added|Unrecognized chain/i.test(switchError?.message ?? '')) {
          if (isRejected(switchError)) throw new UserRejectedRequestError(switchError);
          throw switchError;
        }
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            blockExplorerUrls: addEthereumChainParameter?.blockExplorerUrls ?? (chain.blockExplorers?.default.url ? [chain.blockExplorers.default.url] : []),
            chainId: numberToHex(chainId),
            chainName: addEthereumChainParameter?.chainName ?? chain.name,
            iconUrls: addEthereumChainParameter?.iconUrls,
            nativeCurrency: addEthereumChainParameter?.nativeCurrency ?? chain.nativeCurrency,
            rpcUrls: addEthereumChainParameter?.rpcUrls ?? [...chain.rpcUrls.default.http],
          }],
        });
        return chain;
      }
    };

    return ({
    id: 'walletConnect',
    name: 'WalletConnect',
    type: 'walletConnect',

    async setup() {
      // Intentionally no-op. The built-in wagmi connector initializes the
      // WalletConnect bundle during setup/reconnect; this custom connector
      // loads it only when WalletConnect is selected or a prior WC session is
      // explicitly restored.
    },

    async connect(parameters: any = {}) {
      const { chainId, withCapabilities } = parameters;
      wcDebug('connect_start', { requestedChainId: chainId, withCapabilities: Boolean(withCapabilities) });
      try {
        const provider = await getProviderInternal();
        if (!provider) throw new ProviderNotFoundError();

        if (!displayUri) {
          displayUri = handleDisplayUri;
          provider.on('display_uri', displayUri);
          wcDebug('display_uri_listener_registered');
        }

        const targetChainId = chainId ?? config.chains[0]?.id;
        if (!targetChainId) throw new Error('No supported chains found for WalletConnect.');

        if (!provider.session) {
          const optionalChains = config.chains
            .filter((chain) => chain.id !== targetChainId)
            .map((chain) => chain.id);
          wcDebug('provider_connect_call_start', { targetChainId, optionalChains });
          await provider.connect({ optionalChains: [targetChainId, ...optionalChains] });
          wcDebug('provider_connect_call_success', { hasSession: Boolean(provider.session) });
          await config.storage?.setItem(requestedChainsStorageKey, config.chains.map((chain) => chain.id));
        }

        wcDebug('provider_enable_start');
        const accounts = (await provider.enable()).map((account) => getAddress(account));
        wcDebug('provider_enable_success', { accountCount: accounts.length });
        let currentChainId = await getChainIdInternal();
        wcDebug('provider_chain_resolved', { currentChainId });
        if (chainId && currentChainId !== chainId) {
          try {
            wcDebug('switch_chain_start', { from: currentChainId, to: chainId });
            const chain = await switchChainInternal({ chainId });
            currentChainId = chain?.id ?? currentChainId;
            wcDebug('switch_chain_success', { currentChainId });
          } catch (error) {
            if (isRejected(error)) throw new UserRejectedRequestError(error as Error);
            wcError('switch_chain_failed_non_blocking', error, { requestedChainId: chainId, currentChainId });
          }
        }

        if (!accountsChanged) {
          accountsChanged = handleAccountsChanged;
          provider.on('accountsChanged', accountsChanged);
        }
        if (!chainChanged) {
          chainChanged = handleChainChanged;
          provider.on('chainChanged', chainChanged);
        }
        if (!disconnect) {
          disconnect = handleDisconnect;
          provider.on('disconnect', disconnect);
        }
        if (!sessionDelete) {
          sessionDelete = handleDisconnect;
          provider.on('session_delete', sessionDelete);
        }

        await config.storage?.setItem(connectedStorageKey, true);
        wcDebug('connect_success', { chainId: currentChainId, accountCount: accounts.length });

        return {
          accounts: withCapabilities
            ? accounts.map((address) => ({ address, capabilities: {} }))
            : accounts,
          chainId: currentChainId,
        } as any;
      } catch (error) {
        wcError('connect_failed', error, { requestedChainId: chainId });
        if (isRejected(error)) throw new UserRejectedRequestError(error as Error);
        throw error;
      }
    },

    async disconnect() {
      const provider = await getProviderInternal().catch(() => undefined);
      try {
        await provider?.disconnect();
      } catch (error: any) {
        if (!/No matching key/i.test(error?.message ?? '')) throw error;
      } finally {
        if (accountsChanged) provider?.removeListener('accountsChanged', accountsChanged);
        if (chainChanged) provider?.removeListener('chainChanged', chainChanged);
        if (disconnect) provider?.removeListener('disconnect', disconnect);
        if (displayUri) provider?.removeListener('display_uri', displayUri);
        if (sessionDelete) provider?.removeListener('session_delete', sessionDelete);
        accountsChanged = undefined;
        chainChanged = undefined;
        disconnect = undefined;
        displayUri = undefined;
        sessionDelete = undefined;
        provider_ = undefined;
        providerPromise = undefined;
        await config.storage?.removeItem(connectedStorageKey);
        await config.storage?.removeItem(requestedChainsStorageKey);
      }
    },

    async getAccounts() {
      const provider = await getProviderInternal();
      if (!provider) throw new ProviderNotFoundError();
      return (provider.accounts ?? []).map((account) => getAddress(account));
    },

    async getChainId() {
      return getChainIdInternal();
    },

    async getProvider(parameters: any = {}) {
      const { chainId } = parameters;
      const provider = await getProviderInternal();
      if (chainId) await switchChainInternal({ chainId });
      return provider;
    },

    async isAuthorized() {
      const wasConnected = await config.storage?.getItem(connectedStorageKey);
      if (!wasConnected) return false;
      try {
        const provider = await getProviderInternal();
        const accounts = provider?.accounts?.length ? provider.accounts : await provider?.enable();
        return Boolean(accounts?.length);
      } catch {
        await config.storage?.removeItem(connectedStorageKey);
        return false;
      }
    },

    async switchChain({ addEthereumChainParameter, chainId }: any) {
      return switchChainInternal({ addEthereumChainParameter, chainId });
    },

    onAccountsChanged(accounts: string[]) {
      if (!accounts.length) this.onDisconnect();
      else config.emitter.emit('change', { accounts: accounts.map((account) => getAddress(account)) });
    },

    onChainChanged(chainId: string | number) {
      config.emitter.emit('change', { chainId: Number(chainId) });
    },

    onDisconnect() {
      config.storage?.removeItem(connectedStorageKey);
      config.storage?.removeItem(requestedChainsStorageKey);
      config.emitter.emit('disconnect');
    },

    onDisplayUri(uri: string) {
      config.emitter.emit('message', { type: 'display_uri', data: uri });
    },

    onSessionDelete() {
      handleDisconnect();
    },
  } as any);
  });
}