/**
 * FlowBridge MultiSend V1 — live configuration reader.
 *
 * The fee, fee treasury, recipient limit, pause state and config nonce are read
 * from the verified deployment. The snapshot taken for Review is re-read as a
 * genuinely fresh object immediately before signing; if it drifted, the prepared
 * transaction is discarded and the user reviews again instead of silently
 * executing under different economics.
 */
import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { MULTISEND_ABI } from "./abi";
import { multiSendContract } from "./deployments";
import { configFingerprint, type MultiSendConfig } from "./types";

export interface MultiSendConfigState {
  config: MultiSendConfig | null;
  loading: boolean;
  /** Set when the contract is not deployed/verified on this chain, or the read failed. */
  unavailable: string | null;
  refresh: () => Promise<MultiSendConfig | null>;
  fetchFresh: () => Promise<MultiSendConfig | null>;
}

export function useMultiSendConfig(chainId: number): MultiSendConfigState {
  const publicClient = usePublicClient({ chainId });
  const [config, setConfig] = useState<MultiSendConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const read = useCallback(async (): Promise<MultiSendConfig | null> => {
    const address = multiSendContract(chainId);
    if (!address) return null;
    if (!publicClient) return null;
    const base = { address, abi: MULTISEND_ABI } as const;
    const [feeBps, feeRecipient, maxRecipients, configNonce, paused] = await Promise.all([
      publicClient.readContract({ ...base, functionName: "feeBps" }),
      publicClient.readContract({ ...base, functionName: "feeRecipient" }),
      publicClient.readContract({ ...base, functionName: "maxRecipients" }),
      publicClient.readContract({ ...base, functionName: "configNonce" }),
      publicClient.readContract({ ...base, functionName: "paused" }),
    ]);
    return {
      contract: address,
      chainId,
      feeBps: Number(feeBps),
      feeRecipient: feeRecipient as `0x${string}`,
      maxRecipients: Number(maxRecipients),
      configNonce: BigInt(configNonce as bigint),
      paused: Boolean(paused),
    };
  }, [chainId, publicClient]);

  const refresh = useCallback(async () => {
    const address = multiSendContract(chainId);
    if (!address) {
      setConfig(null);
      setUnavailable("MultiSend is not yet live on this network.");
      return null;
    }
    setLoading(true);
    try {
      const next = await read();
      if (!next) {
        setUnavailable("Could not read the MultiSend configuration — nothing can be prepared.");
        return null;
      }
      setConfig(next);
      setUnavailable(next.paused ? "MultiSend is paused right now." : null);
      return next;
    } catch {
      setConfig(null);
      setUnavailable("Could not read the MultiSend configuration — nothing can be prepared.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [chainId, read]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, loading, unavailable, refresh, fetchFresh: read };
}

/** True when a reviewed snapshot no longer matches fresh chain state. */
export function isConfigStale(reviewed: MultiSendConfig | null, fresh: MultiSendConfig | null): boolean {
  if (!reviewed || !fresh) return true;
  return configFingerprint(reviewed) !== configFingerprint(fresh);
}
