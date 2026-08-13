export type StepStatus = 'pending' | 'submitted' | 'done' | 'failed';

export interface StepState {
  step_id: string;
  status: StepStatus;
  chain_id?: number | string;
  tx_hash?: string;
  token_in?: string;
  token_out?: string;
  amount_in?: string;
  expected_amount_out?: string;
  actual_amount_out?: string;
  timestamp?: number;
  error_message?: string;
}

/**
 * Phase 4B additive metadata: a mined Adapter SOURCE transaction is recorded
 * here as PENDING only. It never means the cross-chain transfer settled.
 */
export interface PendingAdapterBridge {
  tx_hash: string;
  gateway_nonce?: string;
  source_chain_id: number;
  destination_chain_id: number;
  adapter_address: string;
  amount: string;
  destination_recipient: string;
  refund_recipient: string;
  deadline?: string;
  timestamp: number;
  /**
   * Lifecycle status. 'pending' until the Adapter's on-chain requestState()
   * says otherwise (Phase 5A). Older persisted sessions only ever had 'pending'.
   */
  status: 'pending' | 'executed' | 'refund_available' | 'refund_claimed' | 'inconsistent';
}

export interface RouteSession {
  step1: StepState;
  step2: StepState;
  step3: StepState;
  /** optional; old persisted sessions without this field remain valid */
  pendingAdapterBridge?: PendingAdapterBridge;
}

const DEFAULT_SESSION: RouteSession = {
  step1: { step_id: 'ca_bot', status: 'pending' },
  step2: { step_id: 'bot_usdt', status: 'pending' },
  step3: { step_id: 'bridge_usdt', status: 'pending' },
};

export function getLocalSession(): RouteSession {
  try {
    const saved = localStorage.getItem('flowbridge_session');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to read session", e);
  }
  return DEFAULT_SESSION;
}

export function saveLocalSession(session: RouteSession) {
  try {
    localStorage.setItem('flowbridge_session', JSON.stringify(session));
  } catch (e) {
    console.error("Failed to save session", e);
  }
}
