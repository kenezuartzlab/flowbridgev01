// V30.2B R2 preflight — read-only. Encodes constructor args, predicts the
// CREATE address, estimates gas and records live chain observations.
// Never signs, never broadcasts, never funds.
const fs = require('fs');
const path = require('path');
const { ethers } = require('/dev-server/node_modules/ethers');

const D = __dirname.replace(/\/scripts$/, '');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const DEPLOYER = '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD';

const ARGS = {
  token_: '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',
  admin_: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  budgetManager_: '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507',
  publisher_: '0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94',
  pauser_: '0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF',
  recoveryRecipient_: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
  minPublishDelay_: 86400,
};

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const creation = fs.readFileSync(path.join(D, 'creation-bytecode.txt'), 'utf8').trim();
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ['address', 'address', 'address', 'address', 'address', 'address', 'uint64'],
    Object.values(ARGS),
  );
  const data = creation + encoded.slice(2);

  const net = await provider.getNetwork();
  const nonce = await provider.getTransactionCount(DEPLOYER, 'pending');
  const balance = await provider.getBalance(DEPLOYER);
  const predicted = ethers.getCreateAddress({ from: DEPLOYER, nonce });
  const predictedCode = await provider.getCode(predicted);
  const tokenCode = await provider.getCode(ARGS.token_);
  const token = new ethers.Contract(
    ARGS.token_,
    ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)'],
    provider,
  );
  let gasEstimate = null;
  try {
    gasEstimate = (await provider.estimateGas({ from: DEPLOYER, data })).toString();
  } catch (e) {
    gasEstimate = 'ESTIMATE_FAILED: ' + (e.shortMessage || e.message);
  }
  const feeData = await provider.getFeeData();

  const out = {
    rpc: RPC,
    chainId: Number(net.chainId),
    blockNumber: await provider.getBlockNumber(),
    deployer: DEPLOYER,
    deployerCodeIsEoa: (await provider.getCode(DEPLOYER)) === '0x',
    pendingNonce: nonce,
    balanceWei: balance.toString(),
    balanceBot: ethers.formatEther(balance),
    predictedCreateAddress: predicted,
    predictedAddressCode: predictedCode,
    predictedAddressCodeless: predictedCode === '0x',
    constructorArgs: { ...ARGS, minPublishDelay_: String(ARGS.minPublishDelay_) },
    constructorArgsEncoded: encoded,
    constructorArgsKeccak256: ethers.keccak256(encoded),
    deploymentDataBytes: (data.length - 2) / 2,
    deploymentDataKeccak256: ethers.keccak256(data),
    rewardToken: {
      address: ARGS.token_,
      codeBytes: (tokenCode.length - 2) / 2,
      name: await token.name(),
      symbol: await token.symbol(),
      decimals: Number(await token.decimals()),
      totalSupplyWei: (await token.totalSupply()).toString(),
    },
    gasEstimate,
    gasPriceWei: feeData.gasPrice ? feeData.gasPrice.toString() : null,
  };
  if (/^\d+$/.test(gasEstimate)) {
    out.bufferedGasLimit = ((BigInt(gasEstimate) * 130n) / 100n).toString();
  }
  fs.writeFileSync(path.join(D, 'unsigned-deployment-data.txt'), data);
  fs.writeFileSync(path.join(D, 'constructor-args.txt'), encoded);
  console.log(JSON.stringify(out, null, 2));
})();
