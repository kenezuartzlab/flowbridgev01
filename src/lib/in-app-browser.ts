// Detects embedded "in-app" browsers (TokenPocket, MetaMask, Trust Wallet,
// Coinbase Wallet, Telegram, Instagram, Facebook, Line, WeChat, etc.).
// Google OAuth's "Use secure browsers" policy blocks sign-in inside these
// WebViews, so we hide the Google button there and show email/SIWE instead.

export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const patterns = [
    /TokenPocket/i,
    /MetaMask/i,
    /Trust\/|TrustWallet/i,
    /CoinbaseWallet|CBWallet/i,
    /imToken/i,
    /SafePal/i,
    /BitKeep|Bitget/i,
    /OKApp|OKEx/i,
    /MathWallet/i,
    /Telegram/i,
    /Instagram/i,
    /FBAN|FBAV|FB_IAB/i, // Facebook
    /Line\//i,
    /MicroMessenger/i, // WeChat
    /TikTok/i,
    /; wv\)/i, // generic Android WebView marker
  ];
  return patterns.some((re) => re.test(ua));
}

export function isTokenPocketBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /TokenPocket/i.test(navigator.userAgent || "");
}

export function inAppBrowserName(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const map: Array<[RegExp, string]> = [
    [/TokenPocket/i, "TokenPocket"],
    [/MetaMask/i, "MetaMask"],
    [/Trust\/|TrustWallet/i, "Trust Wallet"],
    [/CoinbaseWallet|CBWallet/i, "Coinbase Wallet"],
    [/imToken/i, "imToken"],
    [/SafePal/i, "SafePal"],
    [/BitKeep|Bitget/i, "Bitget Wallet"],
    [/OKApp|OKEx/i, "OKX Wallet"],
    [/Telegram/i, "Telegram"],
    [/Instagram/i, "Instagram"],
    [/FBAN|FBAV|FB_IAB/i, "Facebook"],
    [/MicroMessenger/i, "WeChat"],
  ];
  for (const [re, name] of map) if (re.test(ua)) return name;
  return null;
}
