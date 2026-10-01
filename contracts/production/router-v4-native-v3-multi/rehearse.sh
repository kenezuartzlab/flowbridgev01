#!/usr/bin/env bash
set -u
export PATH=$(ls -d /nix/store/*foundry-1.4.4/bin):$PATH
R=https://rpc.bohr.life; A=0xd985B142F7d614577f08e2736C67d6b5Bcd41C1E; K=$DEPLOYER_PRIVATE_KEY
D=0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD; T=0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47
W=0xd5452816194a3784dba983426cce7c122f4abd30; U=0x75edC9335175Fc0552D51D48439F229c10420fe3; F=0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac
V3=0x07032d47A1b9f8460cBeE9dC17c1d3E438693929
bal(){ cast call $1 "balanceOf(address)(uint256)" $2 --rpc-url $R | awk '{print $1}'; }
P1=$(cast concat-hex $W 0x000bb8 $U 0x000bb8 $F)
P2=$(cast concat-hex $F 0x000bb8 $U 0x000bb8 $W)
AMT=10000000000000000 # 0.01 tBOT
read FEE _ < <(cast call $A "computeRouterFee(uint256,uint256,address)(uint256,uint256)" 0 $AMT $D --rpc-url $R | head -1)
echo "fee=$FEE"
DL=$(( $(date +%s) + 600 ))
F0=$(bal $F $D); T0=$(cast balance $T --rpc-url $R)
# Slippage enforcement probe (simulation must revert with absurd minimum)
cast call $A "swapNativeToTokenV3MultiSafe(uint256,address,bytes,uint256,uint256,address,uint256,uint256)(uint256)" 0 $F $P1 $AMT 1000000000000000000000000000 $D $DL $FEE --value $((AMT+FEE)) --from $D --rpc-url $R >/dev/null 2>&1 && echo "SLIPPAGE PROBE: FAIL (did not revert)" || echo "SLIPPAGE PROBE: reverts as required"
SIM=$(cast call $A "swapNativeToTokenV3MultiSafe(uint256,address,bytes,uint256,uint256,address,uint256,uint256)(uint256)" 0 $F $P1 $AMT 1 $D $DL $FEE --value $((AMT+FEE)) --from $D --rpc-url $R | awk '{print $1}')
MIN=$(python3 -c "print(int($SIM)*99//100)")
echo "BOT->FLOW simulated=$SIM min=$MIN"
TX1=$(cast send $A "swapNativeToTokenV3MultiSafe(uint256,address,bytes,uint256,uint256,address,uint256,uint256)" 0 $F $P1 $AMT $MIN $D $DL $FEE --value $((AMT+FEE)) --rpc-url $R --private-key $K --json)
H1=$(echo "$TX1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['transactionHash'],d['status'],int(d['gasUsed'],16))")
F1=$(bal $F $D); T1=$(cast balance $T --rpc-url $R)
echo "TX1 $H1 FLOWgain=$((F1-F0)) treasuryBOTgain=$((T1-T0))"
echo "residue BOT=$(cast balance $A --rpc-url $R) WBOT=$(bal $W $A) USDT=$(bal $U $A) FLOW=$(bal $F $A) allowWBOT=$(cast call $W 'allowance(address,address)(uint256)' $A $V3 --rpc-url $R)"
echo "SwapActivity logs in TX1: $(echo "$TX1" | python3 -c "import sys,json;d=json.load(sys.stdin);t='0x'+'$(cast keccak 'SwapActivity(address,address,uint256,address,address,uint256,uint256,uint256)' | sed 's/0x//')';print(sum(1 for l in d['logs'] if l['topics'][0]==t))")"

# Reverse: half of received FLOW
BACK=$(( (F1-F0) / 2 ))
read FEE2 _ < <(cast call $A "computeRouterFee(uint256,uint256,address)(uint256,uint256)" 0 $BACK $D --rpc-url $R | head -1)
TF0=$(bal $F $T)
cast send $F "approve(address,uint256)" $A $((BACK+FEE2)) --rpc-url $R --private-key $K --json | python3 -c "import sys,json;d=json.load(sys.stdin);print('APPROVE',d['transactionHash'],d['status'])"
SIM2=$(cast call $A "swapTokenToNativeV3MultiSafe(uint256,address,bytes,uint256,uint256,address,uint256,uint256)(uint256)" 0 $F $P2 $BACK 1 $D $DL $FEE2 --from $D --rpc-url $R | awk '{print $1}')
MIN2=$(python3 -c "print(int($SIM2)*99//100)")
B0=$(cast balance $D --rpc-url $R)
TX2=$(cast send $A "swapTokenToNativeV3MultiSafe(uint256,address,bytes,uint256,uint256,address,uint256,uint256)" 0 $F $P2 $BACK $MIN2 $D $DL $FEE2 --rpc-url $R --private-key $K --json)
H2=$(echo "$TX2" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['transactionHash'],d['status'],int(d['gasUsed'],16),int(d['effectiveGasPrice'],16))")
B1=$(cast balance $D --rpc-url $R)
echo "FLOW->BOT back=$BACK fee=$FEE2 simulated=$SIM2 min=$MIN2"
echo "TX2 $H2 walletBOTdelta(after gas)=$((B1-B0)) treasuryFLOWgain=$(( $(bal $F $T) - TF0 ))"
echo "residue BOT=$(cast balance $A --rpc-url $R) WBOT=$(bal $W $A) USDT=$(bal $U $A) FLOW=$(bal $F $A) allowFLOW=$(cast call $F 'allowance(address,address)(uint256)' $A $V3 --rpc-url $R) userAllowFLOW=$(cast call $F 'allowance(address,address)(uint256)' $D $A --rpc-url $R)"
