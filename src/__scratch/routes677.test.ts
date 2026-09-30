import { it } from "vitest";
import { getBestRoute, diagnoseConnectivity, dexLabel } from "@/lib/swap/quoter";
const BOT = { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", symbol: "BOT", name: "BOT", decimals: 18, isNative: true };
const FLOW = { address: "0xcaab50f36252a57529afef651fa6b9f9281917ff", symbol: "FLOW", name: "FLOW", decimals: 18 };
const CA = { address: "0x546307af427902a75771434df831d88219784e19", symbol: "CA", name: "CA", decimals: 18 };
const MONEY = { address: "0xdaaabbd103c95395197c79890858922549a7a5e2", symbol: "MONEY", name: "Money", decimals: 6 };
const USDT = { address: "0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c", symbol: "USDT", name: "USDT", decimals: 6 };
const cases: [any, any, bigint][] = [[BOT,FLOW,10n**17n],[FLOW,BOT,10000n*10n**18n],[CA,FLOW,10n**17n],[FLOW,CA,10000n*10n**18n],[MONEY,FLOW,10n**6n],[FLOW,MONEY,10000n*10n**18n],[USDT,FLOW,10n**6n],[FLOW,USDT,10000n*10n**18n]];
it("live 677 routes", async () => {
  for (const [a,b,amt] of cases) {
    for (const pref of ["auto","bdex-v3","bdex-v2"] as const) {
      const r = await getBestRoute(a,b,amt,true,pref);
      console.log(`${a.symbol}->${b.symbol} [${pref}]`, r ? `ROUTE FOUND ${r.symbolPath.join("→")} out=${r.amountOut} legs=${r.steps.map(s=>dexLabel(s.dex)+(s.v3Fee?`@${s.v3Fee}`:"")).join(",")}` : "NO CONNECTED LIQUIDITY");
    }
  }
  console.log(JSON.stringify(await diagnoseConnectivity(MONEY,true)));
}, 300000);
