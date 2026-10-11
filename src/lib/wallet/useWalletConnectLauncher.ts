import { useCallback, useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import { classifyWalletError, safeErrorReason, WALLET_ERROR_MESSAGES } from "./walletErrors";

/**
 * V34.2D — WalletConnect launcher with visible feedback.
 *
 * Keeps the calling dialog open while the WalletConnect SDK loads, reports
 * when the QR / wallet list is ready (display_uri) so the caller can step
 * aside, and turns any failure into plain copy. Connect only — never signs.
 * Only the SDK code is warmed (no relay session) when `warm` is true.
 */
export type WcLaunchStatus = "idle" | "opening" | "slow" | "shown" | "error";

const SLOW_MS = 12_000;

export function useWalletConnectLauncher(connector: any | undefined, warm: boolean) {
  const { connectAsync } = useConnect();
  const [status, setStatus] = useState<WcLaunchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const runId = useRef(0);

  // Download the WalletConnect code ahead of the tap (no network session).
  useEffect(() => {
    if (!warm || !connector) return;
    void import("@walletconnect/ethereum-provider").catch(() => undefined);
  }, [warm, connector]);

  const reset = useCallback(() => {
    runId.current += 1;
    setStatus("idle");
    setError(null);
    setReason(null);
  }, []);

  const launch = useCallback(
    async (onShown?: () => void) => {
      if (!connector) {
        setStatus("error");
        setError(WALLET_ERROR_MESSAGES.WALLETCONNECT_UNAVAILABLE);
        return false;
      }
      const id = ++runId.current;
      setError(null);
      setReason(null);
      setStatus("opening");
      const onMessage = (m: { type?: string }) => {
        if (m?.type === "display_uri" && runId.current === id) {
          setStatus("shown");
          onShown?.();
        }
      };
      connector.emitter?.on?.("message", onMessage);
      const slow = setTimeout(() => {
        if (runId.current === id) setStatus((s) => (s === "opening" ? "slow" : s));
      }, SLOW_MS);
      try {
        await connectAsync({ connector });
        if (runId.current === id) setStatus("idle");
        return true;
      } catch (e) {
        if (runId.current !== id) return false;
        const kind = classifyWalletError(e, "connect");
        const why = safeErrorReason(e);
        // Sanitized only — never session data, URIs or addresses.
        console.warn("[walletconnect] connect failed:", kind, why);
        setReason(why);
        setStatus("error");
        const closed = kind === "USER_REJECTED" || /request reset|modal closed|proposal expired/i.test(why);
        setError(
          closed
            ? "WalletConnect was closed. Nothing changed — tap it again to retry."
            : WALLET_ERROR_MESSAGES.WALLETCONNECT_UNAVAILABLE,
        );
        return false;
      } finally {
        clearTimeout(slow);
        connector.emitter?.off?.("message", onMessage);
      }
    },
    [connector, connectAsync],
  );

  return { status, error, reason, launch, reset };
}
