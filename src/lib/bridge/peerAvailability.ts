/** New bridge selections only; historical Tron tracking remains readable. */
export const SELECTABLE_BRIDGE_PEERS = ['BNB', 'ETH'] as const;

export function isBridgePeerSelectable(peer: string): boolean {
  return SELECTABLE_BRIDGE_PEERS.some((available) => available === peer);
}

export function isBridgeDirectionSelectable(direction: string): boolean {
  return SELECTABLE_BRIDGE_PEERS.some((peer) =>
    direction === `BOT_TO_${peer}` || direction === `${peer}_TO_BOT`,
  );
}