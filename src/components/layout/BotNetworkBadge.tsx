import officialLogo from "@/assets/bot-chain-official-wordmark.png.asset.json";
import { useSelectedNetwork } from "@/lib/network/networkSession";

export function BotNetworkBadge({ isMainnet }: { isMainnet?: boolean }) {
  const [selectedMainnet] = useSelectedNetwork();
  const mainnet = isMainnet ?? selectedMainnet;
  return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-card px-1.5 py-1 text-[9px] font-bold leading-none text-muted" aria-label={mainnet ? "BOT Mainnet" : "BOT Testnet"}>
    <img src={officialLogo.url} alt="BOT Chain" className="h-3 w-[61px] object-contain" />
    <span>{mainnet ? "BOT Mainnet" : "BOT Testnet"}</span>
  </span>;
}