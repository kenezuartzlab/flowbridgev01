import {describe,it,expect} from 'vitest';
import {assertAuditTransport,normalizedReserve,constantProductOut,exactRegistryPreview} from './caswap-audit-policy';
describe('CaSwap correction audit boundaries',()=>{
 it.each(['eth_sendTransaction','eth_sendRawTransaction','personal_sign','eth_sign','anvil_setBalance'])('rejects external %s',method=>{expect(()=>assertAuditTransport('https://rpc.botchain.ai',method)).toThrow();});
 it('allows only local registration effects without signing',()=>{expect(()=>assertAuditTransport('http://127.0.0.1:8547','eth_sendTransaction')).not.toThrow();expect(()=>assertAuditTransport('http://127.0.0.1:8547','eth_sign')).toThrow();});
 it('rejects nonliteral local and untrusted endpoints',()=>{expect(()=>assertAuditTransport('http://localhost:8547','eth_sendTransaction')).toThrow();expect(()=>assertAuditTransport('https://evil.test','eth_call')).toThrow();});
 it('allows official read calls',()=>{expect(()=>assertAuditTransport('https://rpc.botchain.ai','eth_call')).not.toThrow();});
 it('normalizes old CA dust at 18 decimals, not token units',()=>{expect(normalizedReserve(84038367n,18)).toBe('0.000000000084038367');});
 it('normalizes native and USDT independently',()=>{expect(normalizedReserve(16566580112457n,18)).toBe('0.000016566580112457');expect(normalizedReserve(5000000n,6)).toBe('5.000000');});
 it('reproduces fee-adjusted buy and sell exactly at recorded reserves',()=>{expect(constantProductOut(10n**18n,387896799903655838997005n,511434669547932304486769n,0n)).toBe(1318477881738334040n);expect(constantProductOut(10n**18n,511434669547932304486769n,387896799903655838997005n,7300n)).toBe(204780956237682805n);});
 it('rejects invalid math inputs',()=>{expect(()=>constantProductOut(1n,0n,1n,0n)).toThrow();expect(()=>normalizedReserve(1n,1.5)).toThrow();});
 it('keeps exact proposed router/wrapper separate from the live default',()=>{const p=exactRegistryPreview('0xe3c1bCEF83C23331593f38B85e16Cf172C022737','0x68CAeA9104419203cF8b8f0B222E75709B97bfc6');expect(p.rtype).toBe(0);expect(p.activation).toBe('NOT_AUTHORIZED');expect(p.defaultRoute).toBe('UNCHANGED_BDEX_V3');});
 it('rejects old router and wrong native wrapper',()=>{expect(()=>exactRegistryPreview('0x5b90611D4eB8FC82Fc2E3d1F0501Dd6F434441AD','0x68CAeA9104419203cF8b8f0B222E75709B97bfc6')).toThrow();expect(()=>exactRegistryPreview('0xe3c1bCEF83C23331593f38B85e16Cf172C022737','0xD5452816194a3784dBa983426cCe7c122F4abd30')).toThrow();});
});
