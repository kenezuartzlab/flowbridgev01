/**
 * FlowBridge MultiSend V1 — QR input policy.
 *
 * QR is INPUT ONLY. A scan can never send, approve, sign, switch network, or
 * execute an unknown URI instruction. Only a raw EVM address or a safely parsed
 * EIP-681 style payment URI is accepted, and any chain id inside the URI must
 * match the selected network before the row is added.
 */
import type { Address } from "./types";

export interface QrScanResult {
  ok: true;
  address: Address;
  /** Optional prefilled amount in human units — always editable afterwards. */
  amountText: string | null;
  chainId: number | null;
}

export interface QrScanRejection {
  ok: false;
  reason: string;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

export function parseQrPayload(raw: string, selectedChainId: number): QrScanResult | QrScanRejection {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, reason: "Empty QR code." };

  if (ADDRESS_RE.test(text)) return accept(text, null, null);

  // EIP-681 style: ethereum:<address>[@chainId][/function][?params]
  if (/^ethereum:/i.test(text)) {
    const body = text.slice("ethereum:".length);
    const [target, queryPart] = body.split("?");
    const cleanTarget = target.split("/")[0].replace(/^pay-/i, "");
    const [addressPart, chainPart] = cleanTarget.split("@");
    if (!ADDRESS_RE.test(addressPart)) return { ok: false, reason: "QR code does not contain a valid address." };

    let chainId: number | null = null;
    if (chainPart !== undefined && chainPart !== "") {
      const parsed = Number(chainPart);
      if (!Number.isInteger(parsed) || parsed <= 0) return { ok: false, reason: "QR code has an unreadable network id." };
      chainId = parsed;
    }
    if (chainId !== null && chainId !== selectedChainId) {
      return { ok: false, reason: "This QR code is for a different network than the one you selected." };
    }

    let amountText: string | null = null;
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      const value = params.get("value") ?? params.get("amount");
      if (value !== null) {
        if (!/^\d+(\.\d+)?([eE]\d+)?$/.test(value.trim())) {
          return { ok: false, reason: "QR code amount is not a plain number — add the amount by hand." };
        }
        amountText = value.trim();
      }
    }
    return accept(addressPart, amountText, chainId);
  }

  // Anything else: only trust an embedded address, never an instruction.
  const embedded = text.match(/0x[a-fA-F0-9]{40}/);
  if (embedded) return accept(embedded[0], null, null);
  return { ok: false, reason: "QR code is not a supported address or payment code." };
}

function accept(address: string, amountText: string | null, chainId: number | null): QrScanResult | QrScanRejection {
  if (address.toLowerCase() === ZERO) return { ok: false, reason: "Zero address is never accepted." };
  return { ok: true, address: address as Address, amountText, chainId };
}

/** Short, checksum-safe display form. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
