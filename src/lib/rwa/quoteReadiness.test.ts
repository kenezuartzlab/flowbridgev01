import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi } from "viem";
import { POOL_GATE as G, OFFICIAL_RPC, TEST_USDT_SIZES, factoryAbi, quoterAbi, identityFailures, quoteFresh, sizeFailures, allowedObservationTarget, validateReadOnlyRequest, type PoolIdentity, type SizeObservation } from "./quoteReadiness";

/** Synthetic fixtures only. Genuine RPC evidence is collected separately by scripts/rwa-pool-acceptance.ts. */
const fixture: PoolIdentity = {chainId:56,factoryPool:G.pool,factory:G.factory,token0:G.xaut,token1:G.usdt,fee:500,tickSpacing:10,xautDecimals:6,usdtDecimals:18,xautSymbol:"XAUt",usdtSymbol:"USDT",liquidity:"12345",unlocked:true,codesPresent:true,peerAgrees:true,blockCanonical:true};
const size: SizeObservation = {usdtSize:5,xautInput:"0.001",buyOutput:"0.001",sellOutput:"4.99",buyGas:95000,sellGas:90000,buyTicks:1,sellTicks:1,buyImpactBps:8,sellImpactBps:8,roundTripLossBps:20,spreadBps:20};
describe("mocked exact-pool quote gate, not live proof",()=>{
  it("requires exact owner-specified chain/pool/tokens/500 fee and observed decimals",()=>{
    expect([G.chainId,G.pool,G.factory,G.quoter,G.fee,G.xautDecimals,G.usdtDecimals]).toEqual([56,"0x83A0A8A723262651Ae9C54BBbA929F167443bC59","0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865","0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",500,6,18]);
    expect(identityFailures(fixture)).toEqual([]);
    expect(TEST_USDT_SIZES).toEqual([5,25,100,500,1000]);
  });
  for (const [field,value] of Object.entries({chainId:677,factoryPool:G.router,factory:G.quoter,token0:G.usdt,token1:G.xaut,fee:3000,tickSpacing:60,xautDecimals:18,usdtDecimals:6,xautSymbol:"GOLD",usdtSymbol:"USD",liquidity:"0",unlocked:false,codesPresent:false,peerAgrees:false,blockCanonical:false})) {
    it(`blocks mocked ${field} mismatch independently`,()=>expect(identityFailures({...fixture,[field]:value})).not.toEqual([]));
  }
  it("does not treat invalid liquidity or malformed quotes as healthy",()=>{
    expect(identityFailures({...fixture,liquidity:"not-a-number"})).toContain("pool-inactive");
    expect(sizeFailures({...size,buyOutput:"0"})).toContain("invalid-quote");
    expect(sizeFailures({...size,spreadBps:NaN})).toContain("invalid-quote");
    expect(sizeFailures({...size,error:"revert"})).toContain("quote-error");
  });
  it("expires proposals at 60s quote TTL and 30s block age; rejects future/invalid dates",()=>{
    const t=Date.parse("2026-11-17T06:41:08Z");
    expect(quoteFresh(new Date(t).toISOString(),new Date(t).toISOString(),t+30000)).toBe(true);
    expect(quoteFresh(new Date(t).toISOString(),new Date(t).toISOString(),t+30001)).toBe(false);
    expect(quoteFresh(new Date(t).toISOString(),new Date(t+31001).toISOString(),t+61001)).toBe(false);
    expect(quoteFresh("bad","bad",t)).toBe(false);
    expect(quoteFresh(new Date(t+1).toISOString(),new Date(t).toISOString(),t)).toBe(false);
  });
  it("separately applies proposed impact, loss, concentration and gas limits",()=>{
    expect(sizeFailures(size)).toEqual([]);
    expect(sizeFailures({...size,buyImpactBps:101})).toContain("impact");
    expect(sizeFailures({...size,roundTripLossBps:101})).toContain("round-trip");
    expect(sizeFailures({...size,roundTripLossBps:-1})).toContain("round-trip");
    expect(sizeFailures({...size,sellTicks:11})).toContain("concentration");
    expect(sizeFailures({...size,sellGas:1000001})).toContain("quoter-gas");
  });
  it("isolates observation contracts from BOT, MultiSend and arbitrary RPC",()=>{
    expect(allowedObservationTarget(56,G.pool)).toBe(true);
    expect(allowedObservationTarget(677,G.pool)).toBe(false);
    expect(allowedObservationTarget(56,"0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e")).toBe(false);
    expect(()=>validateReadOnlyRequest("https://evil.example","eth_chainId",[])).toThrow();
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_getCode",["0x1111111111111111111111111111111111111111","latest"])).toThrow();
  });
  for (const method of ["eth_sendTransaction","eth_sendRawTransaction","eth_getTransactionCount","personal_sign","eth_sign","eth_estimateGas"]) it(`forbids ${method}`,()=>expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],method,[])).toThrow());
  it("forbids approvals, transfers, router calls, unknown tokens and excess quote sizes",()=>{
    const approve=encodeFunctionData({abi:parseAbi(["function approve(address spender,uint256 value) returns (bool)"]),functionName:"approve",args:[G.router,1n]});
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.xaut,data:approve},"latest"])).toThrow();
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.router,data:approve},"latest"])).toThrow();
    const data=(amount: bigint,tokenOut: `0x${string}`=G.xaut)=>encodeFunctionData({abi:quoterAbi,functionName:"quoteExactInputSingle",args:[{tokenIn:G.usdt,tokenOut,amountIn:amount,fee:500,sqrtPriceLimitX96:0n}]});
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.quoter,data:data(5n*10n**18n)},"latest"])).not.toThrow();
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.quoter,data:data(1001n*10n**18n)},"latest"])).toThrow();
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.quoter,data:data(5n*10n**18n,G.router)},"latest"])).toThrow();
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.quoter,data:data(1n),from:G.xaut},"latest"])).toThrow();
    const otherPool=encodeFunctionData({abi:factoryAbi,functionName:"getPool",args:[G.xaut,G.router,500]});
    expect(()=>validateReadOnlyRequest(OFFICIAL_RPC[0],"eth_call",[{to:G.factory,data:otherPool},"latest"])).toThrow();
  });
});