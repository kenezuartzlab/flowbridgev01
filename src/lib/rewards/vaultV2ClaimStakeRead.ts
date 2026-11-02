import { decodeEventLog, encodeFunctionData, parseAbi, type Address, type Hex } from 'viem';
import { FLOW_ERC20_ABI, STAKING_VAULT_ABI, STAKING_CONTROLLER_PRODUCT_ABI, STAKING_TREASURY_ABI, mainnetStakingAddresses, isMainnetStakingProductExecutable } from '@/lib/staking/mainnetGenesisStaking';
import { VAULT_QUOTE_ABI } from '@/lib/staking/useMainnetLockedStake';
import { resolveCanonicalAddress } from '@/lib/deploy/v302bCanonicalRegistry';
import { getActiveProvider } from '@/lib/wallet/activeProvider';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
import { VAULT_V2_CONFIG, vaultClaimGate } from './vaultV2';
import { readVaultV2, vaultClient } from './vaultV2Read';
import { flexibleGate, quoteFingerprint, type ClaimStakeOperation, type ClaimStakePort, type FlexibleQuote, type Intent, type Step } from './vaultV2ClaimStake';

const identityAbi = parseAbi(['function token() view returns(address)','function controller() view returns(address)','function treasury() view returns(address)','function MAX_POSITIONS_PER_WALLET() view returns(uint256)','function currentFlowPerSecond(uint8) view returns(uint256)','function currentEpochEnd() view returns(uint256)','event PositionOpened(uint256 indexed positionId,address indexed owner,uint8 productId,uint256 principal,uint16 genesisRateBps,uint16 floorRateBps,uint40 genesisEndAt,uint40 maturityAt,bool genesisApplied)']);
export async function readFlexibleQuote(wallet: Address, principal: bigint): Promise<FlexibleQuote> {
  const {token,vault,treasury} = mainnetStakingAddresses();
  const controller = resolveCanonicalAddress(677,'FlowStakingController');
  if (!token || !vault || !treasury || !controller || !isMainnetStakingProductExecutable(0)) throw new Error('Canonical Flexible staking unavailable.');
  const c = vaultClient();
  if (await c.getChainId() !== 677) throw new Error('Wrong staking RPC chain.');
  const block = await c.getBlock();
  const at = {blockNumber:block.number};
  const [actualToken,actualController,actualTreasury,paused,emergency,product,quote,positions,limit,allowance,balance,free,used,cap,rate,end] = await Promise.all([
    c.readContract({address:vault,abi:identityAbi,functionName:'token',...at}),
    c.readContract({address:vault,abi:identityAbi,functionName:'controller',...at}),
    c.readContract({address:vault,abi:identityAbi,functionName:'treasury',...at}),
    c.readContract({address:vault,abi:STAKING_VAULT_ABI,functionName:'paused',...at}),
    c.readContract({address:controller,abi:STAKING_CONTROLLER_PRODUCT_ABI,functionName:'emergencyMode',...at}),
    c.readContract({address:controller,abi:STAKING_CONTROLLER_PRODUCT_ABI,functionName:'products',args:[0n],...at}),
    c.readContract({address:vault,abi:VAULT_QUOTE_ABI,functionName:'quoteOpen',args:[0,wallet,principal],...at}),
    c.readContract({address:vault,abi:STAKING_VAULT_ABI,functionName:'positionCountOf',args:[wallet],...at}),
    c.readContract({address:vault,abi:identityAbi,functionName:'MAX_POSITIONS_PER_WALLET',...at}),
    c.readContract({address:token,abi:FLOW_ERC20_ABI,functionName:'allowance',args:[wallet,vault],...at}),
    c.readContract({address:token,abi:FLOW_ERC20_ABI,functionName:'balanceOf',args:[wallet],...at}),
    c.readContract({address:treasury,abi:STAKING_TREASURY_ABI,functionName:'freeBalance',...at}),
    c.readContract({address:controller,abi:STAKING_CONTROLLER_PRODUCT_ABI,functionName:'genesisYear1Used',...at}),
    c.readContract({address:controller,abi:STAKING_CONTROLLER_PRODUCT_ABI,functionName:'GENESIS_YEAR1_CAP',...at}),
    c.readContract({address:vault,abi:identityAbi,functionName:'currentFlowPerSecond',args:[0],...at}),
    c.readContract({address:vault,abi:identityAbi,functionName:'currentEpochEnd',...at}),
  ]);
  if (actualToken.toLowerCase()!==token.toLowerCase() || actualController.toLowerCase()!==controller.toLowerCase() || actualTreasury.toLowerCase()!==treasury.toLowerCase()) throw new Error('Staking contract identity mismatch.');
  if ((await c.getBlock({blockNumber:block.number})).hash!==block.hash) throw new Error('Staking quote reorganized. Retry.');
  return {token,stakingVault:vault,controller,treasury,principal,minimum:product[6],active:product[0],paused,emergency,lockSeconds:product[1],positions,positionLimit:limit,allowance,balance,genesisRate:quote[0],genesisSeconds:quote[1],genesisObligation:quote[2],floorRate:quote[3],floorObligation:quote[4],genesisAvailable:quote[1]>0&&quote[2]>0n&&cap-used>=quote[2]&&free>=quote[2],variableRate:block.timestamp<end?rate:0n};
}
function transaction(op: ClaimStakeOperation, step: Step) {
  if (step==='claim') return {to:op.rewardVault,data:encodeFunctionData({abi:VAULT_V2_ABI,functionName:'claim'})};
  if (step==='approve') return {to:op.token,data:encodeFunctionData({abi:FLOW_ERC20_ABI,functionName:'approve',args:[op.stakingVault,BigInt(op.principal)]})};
  return {to:op.stakingVault,data:encodeFunctionData({abi:STAKING_VAULT_ABI,functionName:'openPosition',args:[0,BigInt(op.principal)]})};
}
export function createClaimStakePort(config: typeof VAULT_V2_CONFIG, wallet: Address, binding: () => Promise<string | null>, save: ClaimStakePort['save'], status: ClaimStakePort['status']): ClaimStakePort {
  const c = vaultClient();
  const identity = async () => {
    if (!config.enabled || !config.cutoverVerified || !config.address) throw new Error('V2 is not activated.');
    if (await c.getChainId()!==677) throw new Error('Wrong BOT Mainnet RPC chain.');
    if ((await binding())?.toLowerCase()!==wallet.toLowerCase()) throw new Error('Verified account wallet changed. Flow halted.');
    const p = await getActiveProvider();
    if (!p) throw new Error('Reconnect your verified wallet.');
    const accounts = await p.request({method:'eth_accounts'}) as string[];
    if (accounts[0]?.toLowerCase()!==wallet.toLowerCase()) throw new Error('Wallet changed. Flow halted.');
    if (Number(await p.request({method:'eth_chainId'}))!==677) throw new Error('Switch to BOT Mainnet. Flow halted.');
  };
  const preflight = async (step: Step, op: ClaimStakeOperation) => {
    await identity();
    if (op.wallet.toLowerCase()!==wallet.toLowerCase() || op.rewardVault.toLowerCase()!==config.address?.toLowerCase()) throw new Error('Recovery contract or wallet mismatch.');
    const live = await readVaultV2(wallet,config);
    if (!live) throw new Error('Verified rewards deployment unavailable.');
    if (step==='claim') {
      const gate = vaultClaimGate({enabled:config.enabled,verified:config.cutoverVerified,chainId:677,walletMatches:true,...live});
      if (gate!=='READY' || live.claimable!==BigInt(op.claimAmount)) throw new Error('Claim balance or availability changed. Review again.');
    }
    if (op.mode==='stake') {
      const q = await readFlexibleQuote(wallet,BigInt(op.principal));
      flexibleGate(q,op.token,BigInt(op.claimAmount));
      if (q.stakingVault.toLowerCase()!==op.stakingVault.toLowerCase() || quoteFingerprint(q)!==op.terms) throw new Error('Staking terms changed. Review before continuing.');
      if (step!=='claim'&&q.balance<BigInt(op.principal)) throw new Error('Insufficient FLOW in your wallet.');
      if (step==='stake'&&q.allowance<BigInt(op.principal)) throw new Error('Exact staking approval required.');
    }
    const tx = transaction(op,step);
    const gas = await c.estimateGas({account:wallet,to:tx.to,data:tx.data,value:0n});
    const gasPrice = await c.getGasPrice();
    // Conservative reserve for the remaining explicit confirmations, plus fresh per-tx estimation.
    const reserve = step==='claim'&&op.mode==='stake' ? 2_000_000n : gas*2n;
    if (await c.getBalance({address:wallet}) < reserve*gasPrice*2n) throw new Error('Insufficient BOT for network fees. FLOW stays in your wallet after a successful claim.');
    return tx;
  };
  return {
    identity,save,status,
    claimable:async()=>{const live=await readVaultV2(wallet,config);if(!live)throw new Error('Vault unavailable.');return live.claimable;},
    quote:principal=>readFlexibleQuote(wallet,principal),
    prepare:async(step,op)=>{await preflight(step,op);return {step,nonce:await c.getTransactionCount({address:wallet,blockTag:'pending'}),startBlock:(await c.getBlockNumber()).toString(),hash:null};},
    send:async(intent,op)=>{
      const tx = await preflight(intent.step,op);
      if (await c.getTransactionCount({address:wallet,blockTag:'pending'})!==intent.nonce) throw new Error('Wallet nonce changed. Verify pending transaction before continuing.');
      const p = await getActiveProvider(); if(!p)throw new Error('Wallet disconnected.');
      await identity();
      status(`Confirm ${intent.step==='claim'?'Claim FLOW':intent.step==='approve'?'exact FLOW approval':'Flexible stake'} in your wallet…`);
      return await p.request({method:'eth_sendTransaction',params:[{from:wallet,...tx,value:'0x0',nonce:`0x${intent.nonce.toString(16)}`}]}) as Hex;
    },
    verify:async(intent,op)=>{
      if (await c.getChainId()!==677) throw new Error('Wrong receipt RPC chain. Do not repeat transaction.');
      let hash = intent.hash;
      if (!hash) {
        const head = await c.getBlockNumber();
        const start = BigInt(intent.startBlock);
        if(head-start>512n) throw new Error('Unknown submitted transaction needs manual receipt reconciliation. Do not repeat it.');
        for(let n=start;n<=head;n++) {
          const b = await c.getBlock({blockNumber:n,includeTransactions:true});
          const tx = b.transactions.find(t=>typeof t!=='string'&&t.from.toLowerCase()===wallet.toLowerCase()&&t.nonce===intent.nonce);
          if(tx&&typeof tx!=='string'){hash=tx.hash;intent.hash=hash;save(op);break;}
        }
        if (!hash) throw new Error('Transaction submission unknown or pending. Check status; do not send again.');
      }
      const receipt = await c.waitForTransactionReceipt({hash,confirmations:3,timeout:120_000});
      const tx = await c.getTransaction({hash:receipt.transactionHash});
      const expected = transaction(op,intent.step);
      if (tx.from.toLowerCase()!==wallet.toLowerCase() || tx.to?.toLowerCase()!==expected.to.toLowerCase() || tx.input!==expected.data || tx.value!==0n || tx.nonce!==intent.nonce || receipt.transactionHash!==hash) throw new Error('Transaction identity mismatch. Reconcile before retrying.');
      const canonical = await c.getBlock({blockNumber:receipt.blockNumber});
      if(canonical.hash!==receipt.blockHash || await c.getBlockNumber()<receipt.blockNumber+2n) throw new Error('Receipt reorganized or unconfirmed. Do not repeat transaction.');
      if(receipt.status==='reverted')return 'reverted';
      if(intent.step==='claim') {
        const events=receipt.logs.filter(l=>l.address.toLowerCase()===op.rewardVault.toLowerCase()).flatMap(l=>{try {const e=decodeEventLog({abi:VAULT_V2_ABI,data:l.data,topics:l.topics});return e.eventName==='Claimed'?[e.args]:[];} catch{return [];}});
        const amount=BigInt(op.claimAmount);
        const prior=await c.readContract({address:op.rewardVault,abi:VAULT_V2_ABI,functionName:'totalClaimed',args:[wallet],blockNumber:receipt.blockNumber-1n});
        const [claimed,remaining]=await Promise.all([
          c.readContract({address:op.rewardVault,abi:VAULT_V2_ABI,functionName:'totalClaimed',args:[wallet],blockNumber:receipt.blockNumber}),
          c.readContract({address:op.rewardVault,abi:VAULT_V2_ABI,functionName:'claimable',args:[wallet],blockNumber:receipt.blockNumber}),
        ]);
        if(events.length!==1 || events[0].wallet.toLowerCase()!==wallet.toLowerCase() || events[0].amount!==amount || claimed-prior!==amount || remaining!==0n) throw new Error('Claim evidence mismatch. Do not claim again.');
      } else if(intent.step==='approve') {
        const allowance=await c.readContract({address:op.token,abi:FLOW_ERC20_ABI,functionName:'allowance',args:[wallet,op.stakingVault],blockNumber:receipt.blockNumber});
        if(allowance!==BigInt(op.principal))throw new Error('Exact approval receipt not verified.');
      } else {
        const events=receipt.logs.filter(l=>l.address.toLowerCase()===op.stakingVault.toLowerCase()).flatMap(l=>{try{const e=decodeEventLog({abi:identityAbi,data:l.data,topics:l.topics});return [e.args];}catch{return [];}});
        if(events.length!==1)throw new Error('PositionOpened receipt missing.');
        const e=events[0];
        const position=await c.readContract({address:op.stakingVault,abi:STAKING_VAULT_ABI,functionName:'getPosition',args:[e.positionId]});
        if(e.owner.toLowerCase()!==wallet.toLowerCase()||e.productId!==0||e.principal!==BigInt(op.principal)||position.owner.toLowerCase()!==wallet.toLowerCase()||position.productId!==0||position.principal!==BigInt(op.principal)||position.maturityAt!==0||position.status!==0n)throw new Error('Actual Flexible position not verified.');
        const count=await c.readContract({address:op.stakingVault,abi:STAKING_VAULT_ABI,functionName:'positionCountOf',args:[wallet]});
        let found=false;
        for(let i=0n;i<count&&i<32n;i++) if(await c.readContract({address:op.stakingVault,abi:STAKING_VAULT_ABI,functionName:'positionsOf',args:[wallet,i]})===e.positionId)found=true;
        if(!found)throw new Error('Position ownership enumeration mismatch.');
      }
      if((await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw new Error('Receipt reorganized. Do not repeat transaction.');
      return 'success';
    },
  };
}