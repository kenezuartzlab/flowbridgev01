import officialLogo from "@/assets/bot-chain-official-wordmark.png.asset.json";
import { useSelectedNetwork } from "@/lib/network/networkSession";

export function BotNetworkBadge({ isMainnet }: { isMainnet?: boolean }) {
  const [selectedMainnet] = useSelectedNetwork();
  const mainnet = isMainnet ?? selectedMainnet;
  return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-card px-1.5 py-1 text-[9px] font-bold leading-none text-muted" aria-label={mainnet ? "BOT Mainnet" : "BOT Testnet"}>
    <span className="block h-3.5 w-3.5 shrink-0 overflow-hidden"><img src={officialLogo.url} alt="BOT Chain" className="h-3.5 w-[72px] max-w-none" /></span>
    <span>{mainnet ? "BOT Mainnet" : "BOT Testnet"}</span>
  </span>;
}