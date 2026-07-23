// Sign-In With Ethereum helper. Asks the wallet to sign a domain-bound
// message and exchanges the signature for a Supabase session when the wallet
// is already linked to a registered email.
import { supabase } from "@/integrations/supabase/client";
import { markWalletVerified } from "@/lib/walletVerification";

export type SiweResult =
  | { status: "signed_in"; email: string }
  | { status: "needs_binding" };

function buildMessage(opts: { address: string; nonce: string; domain: string; uri: string; chainId: number }) {
  const issuedAt = new Date().toISOString();
  return [
    `${opts.domain} wants you to sign in with your Ethereum account:`,
    opts.address,
    "",
    "Sign in to FlowBridge to link your wallet to your account. This signature is gasless and proves you control this wallet.",
    "",
    `URI: ${opts.uri}`,
    `Version: 1`,
    `Chain ID: ${opts.chainId}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function signInWithEthereum(args: {
  address: string;
  chainId: number;
  signMessage: (msg: string) => Promise<string>;
}): Promise<SiweResult> {
  const address = args.address.toLowerCase();

  const nonceRes = await fetch("/api/public/siwe/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
  const nonceJson = await nonceRes.json();
  if (!nonceRes.ok) throw new Error(nonceJson?.error ?? "Could not get nonce");
  const nonce: string = nonceJson.nonce;

  const message = buildMessage({
    address,
    nonce,
    chainId: args.chainId,
    domain: window.location.host,
    uri: window.location.origin,
  });

  const signature = await args.signMessage(message);

  const verifyRes = await fetch("/api/public/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address, message, signature, nonce }),
  });
  const verifyJson = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(verifyJson?.error ?? "Signature verification failed");

  markWalletVerified(address);

  if (verifyJson.needs_binding) return { status: "needs_binding" };

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: verifyJson.token_hash,
    type: "email",
  });
  if (error) throw error;
  if (!data.session?.access_token || !data.session.refresh_token || !data.user) {
    throw new Error("Wallet signature was accepted, but the sign-in session was not created. Please try again.");
  }
  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  return { status: "signed_in", email: data.user?.email ?? verifyJson.email };
}
