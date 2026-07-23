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

export interface RouteSession {
  step1: StepState;
  step2: StepState;
  step3: StepState;
}

const DEFAULT_SESSION: RouteSession = {
  step1: { step_id: 'ca_bot', status: 'pending' },
  step2: { step_id: 'bot_usdt', status: 'pending' },
  step3: { step_id: 'bridge_usdt', status: 'pending' },
};

export function getLocalSession(): RouteSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION;
  try {
    const saved = window.localStorage.getItem('flowbridge_session');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to read session", e);
  }
  return DEFAULT_SESSION;
}

export function saveLocalSession(session: RouteSession) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('flowbridge_session', JSON.stringify(session));
  } catch (e) {
    console.error("Failed to save session", e);
  }
}
