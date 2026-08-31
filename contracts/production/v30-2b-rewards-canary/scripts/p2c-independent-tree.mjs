// Independent, dependency-free reward-tree rebuild for V30.2B P2C.
// Runs in a FRESH process with NO shared state with the preflight script and
// re-derives leaf/root/proof from first principles. Read-only; prints JSON.
import { keccak256, encodeAbiParameters, getAddress } from 'viem';

const [, , chainIdArg, distributorArg, epochIdArg, indexArg, accountArg, amountArg] = process.argv;

const leaf = keccak256(
  keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        BigInt(chainIdArg),
        getAddress(distributorArg),
        BigInt(epochIdArg),
        BigInt(indexArg),
        getAddress(accountArg),
        BigInt(amountArg),
      ],
    ),
  ),
);

// Single-leaf tree: the root IS the leaf and the proof is empty.
console.log(JSON.stringify({ leaf, root: leaf, proof: [], leafCount: 1 }));
