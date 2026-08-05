/**
 * FlowBridge V3 reusable asset kit.
 *
 * Each entry points at a CDN-hosted PNG cropped from the uploaded asset-kit
 * sheets. Purely presentational — used for card, quest and modal artwork.
 */
import badge from "@/assets/kit/badge.png.asset.json";
import bolt from "@/assets/kit/bolt.png.asset.json";
import botChain from "@/assets/kit/bot-chain.png.asset.json";
import caryPact from "@/assets/kit/carypact.png.asset.json";
import coins from "@/assets/kit/coins.png.asset.json";
import community from "@/assets/kit/community.png.asset.json";
import droplet from "@/assets/kit/droplet.png.asset.json";
import flowbridge from "@/assets/kit/flowbridge.png.asset.json";
import gem from "@/assets/kit/gem.png.asset.json";
import gift from "@/assets/kit/gift.png.asset.json";
import handshake from "@/assets/kit/handshake.png.asset.json";
import lock from "@/assets/kit/lock.png.asset.json";
import medal from "@/assets/kit/medal.png.asset.json";
import megaphone from "@/assets/kit/megaphone.png.asset.json";
import network from "@/assets/kit/network.png.asset.json";
import parachute from "@/assets/kit/parachute.png.asset.json";
import robot from "@/assets/kit/robot.png.asset.json";
import rocket from "@/assets/kit/rocket.png.asset.json";
import shieldCheck from "@/assets/kit/shield-check.png.asset.json";
import starCoin from "@/assets/kit/star-coin.png.asset.json";
import target from "@/assets/kit/target.png.asset.json";
import ticket from "@/assets/kit/ticket.png.asset.json";
import trophy from "@/assets/kit/trophy.png.asset.json";
import vault from "@/assets/kit/vault.png.asset.json";

export const KIT = {
  badge: badge.url,
  bolt: bolt.url,
  botChain: botChain.url,
  caryPact: caryPact.url,
  coins: coins.url,
  community: community.url,
  droplet: droplet.url,
  flowbridge: flowbridge.url,
  gem: gem.url,
  gift: gift.url,
  handshake: handshake.url,
  lock: lock.url,
  medal: medal.url,
  megaphone: megaphone.url,
  network: network.url,
  parachute: parachute.url,
  robot: robot.url,
  rocket: rocket.url,
  shieldCheck: shieldCheck.url,
  starCoin: starCoin.url,
  target: target.url,
  ticket: ticket.url,
  trophy: trophy.url,
  vault: vault.url,
} as const;

export type KitName = keyof typeof KIT;
