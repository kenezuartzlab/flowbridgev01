import { describe, expect, it } from 'vitest';
import { buildAuditHandoff } from './bnb-v110-audit-package';

describe('V1.10 reproducible auditor handoff', () => {
  const packet = buildAuditHandoff();

  it('reproduces the exact frozen source, ABI and bytecode identities', () => {
    expect(packet.candidate.checks.sourceSha256).toBe('8ae401a74dce1e6aa7990b7fc5ca0755ac6789b14f6d087021f812f669a7a61a');
    expect(packet.candidate.checks.sourceKeccak).toBe('0xad34078ce1fb1f6d4f31d723d3dfc17dc356ff2bb7e7c3f316f484ca9adf4242');
    expect(packet.candidate.checks.creationBytecodeKeccak).toBe('0xa56d2cbf2e1ba1b966fa6fd03ad90d054feac768a77bd7d7cb200a63a252156c');
    expect(packet.candidate.checks.runtimeBytes).toBe(5446);
    expect(packet.candidate.artifact.abi).toHaveLength(29);
  });

  it('pins compiler and EVM settings in a complete single-source Standard JSON closure', () => {
    expect(packet.candidate.compiler).toBe('0.8.38+commit.1835d247.Emscripten.clang');
    expect(packet.candidate.standardJsonInput.settings.evmVersion).toBe('cancun');
    expect(packet.candidate.standardJsonInput.settings.optimizer).toEqual({ enabled: true, runs: 200 });
    expect(Object.keys(packet.candidate.sourceClosure)).toEqual(['FlowBridgeBnbSwapAdapterV1_6.sol']);
    expect(packet.candidate.constructorTargets.feeRecipient).toBe('UNAPPROVED_CONSTRUCTOR_INPUT');
  });

  it('keeps owner preference separate from every financial and launch approval', () => {
    expect(packet.architecture.status).toBe('OWNER_PREFERRED_ARCHITECTURE_PENDING_APPROVALS');
    expect(packet.independence.independentProfessionalAudit).toBe('NOT_DONE');
    expect(packet.independence.productionApproved).toBe(false);
    expect(packet.launchGates.filter((gate) => gate.state === 'HOLD')).toHaveLength(9);
  });

  it('includes all six HIGH traces, real-bytecode fork evidence and open design risks', () => {
    expect(packet.staticAnalysis.highTraces).toHaveLength(6);
    expect(packet.staticAnalysis.highTraces.every((trace) => trace.status === 'OPEN_PENDING_INDEPENDENT_AUDIT')).toBe(true);
    expect(packet.localFork.status).toBe('PASS');
    expect(packet.localFork.summary.extraGas).toBe('63293');
    expect(packet.riskRegister.some((risk) => risk.id === 'OPS-001' && risk.state === 'OPEN')).toBe(true);
    expect(packet.riskRegister.some((risk) => risk.id === 'RWA-001' && risk.state === 'BLOCKED')).toBe(true);
  });
});
