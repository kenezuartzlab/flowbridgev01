import { describe, expect, it } from 'vitest';
import { CUSTOM_BNB_ARCHITECTURE, CUSTOM_LAUNCH_GATES, customLaunchBlockers } from './customArchitecture';

describe('V1.10 custom architecture preference fence', () => {
  it('records owner preference without production, deployment, fee or recipient approval', () => {
    expect(CUSTOM_BNB_ARCHITECTURE.status).toBe('OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS');
    expect(CUSTOM_BNB_ARCHITECTURE.productionApproved).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.executionEnabled).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.deployed).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.feeRateApproved).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.feeRecipientApproved).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.independentAudit).toBe('NOT_DONE');
  });

  it('preserves 0x diagnostics and BOT execution while blocking XAUt', () => {
    expect(CUSTOM_BNB_ARCHITECTURE.zeroExDiagnostics).toBe('ADMIN_ONLY_READ_ONLY');
    expect(CUSTOM_BNB_ARCHITECTURE.botExecutionChanged).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.xaut).toBe('BLOCKED');
  });

  it('does not claim dynamic pool selection, on-chain pause or donation recovery', () => {
    expect(CUSTOM_BNB_ARCHITECTURE.poolSelection).toBe('SINGLE_IMMUTABLE_POOL_FEE');
    expect(CUSTOM_BNB_ARCHITECTURE.dynamicBestPoolRouting).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.onchainPause).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.uiKillSwitchStopsDirectCalls).toBe(false);
    expect(CUSTOM_BNB_ARCHITECTURE.donationRecovery).toBe(false);
  });

  it('keeps all ten human launch gates present and only source-freeze evidence complete', () => {
    expect(CUSTOM_LAUNCH_GATES).toHaveLength(10);
    expect(CUSTOM_LAUNCH_GATES.filter((gate) => gate.state === 'EVIDENCE_COMPLETE').map((gate) => gate.id)).toEqual(['source-freeze']);
    expect(customLaunchBlockers()).toHaveLength(9);
    expect(customLaunchBlockers().map((gate) => gate.id)).toContain('independent-audit');
    expect(customLaunchBlockers().map((gate) => gate.id)).toContain('deployment-canary');
  });
});
