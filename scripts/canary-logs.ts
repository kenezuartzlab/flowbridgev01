import { createPublicClient, http } from 'viem';
const pub = createPublicClient({ transport: http('https://bsc-testnet-rpc.publicnode.com') });
const r = await pub.getTransactionReceipt({ hash: '0x0de9c0d77462de2e7d76fe21d41503646e8df85973b068dbf93f957ec95ca1ca' });
console.log(r.logs.map(l => ({ addr: l.address, topics: l.topics, data: l.data })));
