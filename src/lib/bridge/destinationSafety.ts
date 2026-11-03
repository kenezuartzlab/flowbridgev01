/** Presentation-only recipient review; does not change bridge execution or routing. */
export function resolveBridgeDestination(wallet: string | undefined, override?: { wallet: string; value: string }) {
  if (!wallet) return '';
  return override?.wallet.toLowerCase() === wallet.toLowerCase() ? override.value : wallet;
}

export function bridgeDestinationReview(destination: string, wallet: string | undefined, acknowledged: string) {
  const recipient = destination.trim();
  const valid = /^0x[a-fA-F0-9]{40}$/.test(recipient)
    && recipient.toLowerCase() !== '0x0000000000000000000000000000000000000000';
  const different = Boolean(wallet && recipient && recipient.toLowerCase() !== wallet.toLowerCase());
  const key = `${wallet?.toLowerCase() ?? ''}:${recipient.toLowerCase()}`;
  return { recipient, valid, different, key, canConfirm: Boolean(wallet && valid && (!different || acknowledged === key)) };
}