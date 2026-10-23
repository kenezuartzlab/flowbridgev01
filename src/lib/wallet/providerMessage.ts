const ACTIONS = new Set(['setAccount', 'accountsChanged', 'setNode', 'connect', 'disconnect']);

/** Same-window provider hints only; payloads never become wallet/account truth. */
export function isTrustedTronMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, host: Window): boolean {
  if (event.origin !== host.location.origin || event.source !== host || !host.tronLink || !host.tronWeb) return false;
  const data: unknown = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const message = (data as Record<string, unknown>).message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  const action = (message as Record<string, unknown>).action;
  return typeof action === 'string' && ACTIONS.has(action);
}