import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Gamepad2,
  Lock as LockIcon,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { KitIcon } from "@/components/kit/KitIcon";
import type { KitName } from "@/lib/kit";
import {
  CHALLENGES,
  WHEEL,
  canSpinToday,
  isClaimedToday,
  readPlayState,
  today,
  writePlayState,
  type PlayState,
} from "@/lib/games/playState";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Games — FlowBridge" },
      {
        name: "description",
        content:
          "Spin the daily wheel, clear challenges and climb the FlowBridge arcade. Off-chain Play Points that keep the ecosystem fun alongside real swap rewards.",
      },
      { property: "og:title", content: "Games — FlowBridge" },
      { property: "og:description", content: "Spin the daily wheel, clear challenges and climb the FlowBridge arcade. Off-chain Play Points that keep the ecosystem fun alongside real swap rewards." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://flowbridge.space/games" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://flowbridge.space/games" }],
  }),
  component: GamesPage,
});

type Tile = {
  id: string;
  label: string;
  hint: string;
  icon: KitName;
  live?: boolean;
};

const TILES: Tile[] = [
  { id: "spin", label: "Lucky Spin", hint: "Daily wheel of fortune", icon: "gem", live: true },
  { id: "challenges", label: "Challenges", hint: "Daily quests + streaks", icon: "target", live: true },
  { id: "higher", label: "Higher / Lower", hint: "Guess the next roll", icon: "bolt", live: true },
  { id: "quiz", label: "Crypto Quiz", hint: "Answer fast, score big", icon: "robot" },
  { id: "referrals", label: "Referrals", hint: "Invite friends, earn", icon: "community" },
];

function GamesPage() {
  const [state, setState] = useState<PlayState>(() => readPlayState());
  const [panel, setPanel] = useState<"spin" | "challenges" | "higher">("spin");
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from storage after mount so SSR and the client agree on markup.
  useEffect(() => {
    setState(readPlayState());
  }, []);

  const update = useCallback((fn: (prev: PlayState) => PlayState) => {
    setState((prev) => writePlayState(fn(prev)));
  }, []);

  const open = (id: string) => {
    if (id === "spin" || id === "challenges" || id === "higher") {
      setPanel(id);
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHeader
        title="Games"
        subtitle="Play · Earn Play Points"
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-2xl border border-hairline bg-card px-3 py-2 font-mono text-[11px] font-black tabular-nums text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {state.points.toLocaleString("en-US")}
          </span>
        }
      />

      <main className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
        {/* Score strip */}
        <section className="fb-surface grid grid-cols-3 divide-x divide-hairline overflow-hidden">
          {[
            { k: "Play points", v: state.points.toLocaleString("en-US") },
            { k: "Spins", v: String(state.spins) },
            { k: "Best streak", v: String(state.bestStreak) },
          ].map((cell) => (
            <div key={cell.k} className="p-3 text-center">
              <p className="fb-eyebrow">{cell.k}</p>
              <p className="mt-1 font-mono text-lg font-black tabular-nums">{cell.v}</p>
            </div>
          ))}
        </section>

        <p className="flex items-start gap-2 px-1 font-mono text-[10px] leading-relaxed text-muted">
          <LockIcon className="mt-[1px] h-3 w-3 shrink-0 text-primary" />
          <span>
            <span className="mr-1.5 inline-flex items-center rounded-full border border-hairline bg-card px-1.5 py-0.5 font-black uppercase tracking-[0.1em] text-foreground">
              Demo only
            </span>
            Play Points are a local arcade score — they are not XP and not FLOW Points (PTS), and cannot
            be claimed. PTS stay tied to real qualified swap volume; playing games never changes them.
          </span>
        </p>

        {/* Arcade tiles */}
        <section>
          <p className="fb-eyebrow mb-2 px-1">Arcade</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TILES.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => open(tile.id)}
                disabled={!tile.live}
                className="glass-card flex min-h-[124px] flex-col items-start gap-2 rounded-[var(--fb-radius-md)] p-3 text-left disabled:opacity-55"
              >
                <KitIcon name={tile.icon} size={44} glow={tile.live} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-black">{tile.label}</span>
                  <span className="mt-0.5 block truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    {tile.live ? tile.hint : "Soon"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <div ref={panelRef} className="scroll-mt-24">
          {panel === "spin" && <LuckySpin state={state} update={update} />}
          {panel === "challenges" && <Challenges state={state} update={update} />}
          {panel === "higher" && <HigherLower update={update} />}
        </div>

        <Leaderboard points={state.points} />

        <Link
          to="/rewards"
          className="fb-surface flex items-center gap-3 p-4 transition-colors hover:border-primary/40"
        >
          <KitIcon name="trophy" size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black">Real rewards live in Rewards</span>
            <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-muted">
              FLOW Points (PTS), XP levels, referrals and claims.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </main>

      <BottomNav />
    </div>
  );
}

/* ------------------------------- Leaderboard ------------------------------ */

const DEMO_BOARD: { name: string; points: number }[] = [
  { name: "0xArchon", points: 18450 },
  { name: "botmaxi.eth", points: 15220 },
  { name: "caryfan", points: 12980 },
  { name: "flowsurfer", points: 9310 },
  { name: "bridgewhale", points: 7640 },
  { name: "spin.king", points: 5120 },
];

function Leaderboard({ points }: { points: number }) {
  const rows = useMemo(() => {
    const all = [...DEMO_BOARD, { name: "You", points }].sort((a, b) => b.points - a.points);
    return all.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [points]);

  const medal = (rank: number) =>
    rank === 1 ? "trophy" : rank === 2 ? "medal" : rank === 3 ? "badge" : null;

  return (
    <section className="fb-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <p className="fb-eyebrow">Leaderboard</p>
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted">
          Demo only
        </span>
      </div>
      <ul className="divide-y divide-hairline">
        {rows.map((r) => {
          const kit = medal(r.rank) as KitName | null;
          const isYou = r.name === "You";
          return (
            <li
              key={r.name}
              className={`flex items-center gap-3 px-4 py-2.5 ${isYou ? "bg-primary/8" : ""}`}
            >
              <span className="w-6 shrink-0 font-mono text-[11px] font-black tabular-nums text-muted">
                {r.rank}
              </span>
              {kit ? (
                <KitIcon name={kit} size={26} />
              ) : (
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-primary/12 font-mono text-[10px] font-black text-primary">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <p
                className={`min-w-0 flex-1 truncate text-[12.5px] font-black ${isYou ? "text-primary" : ""}`}
              >
                {r.name}
              </p>
              <p className="shrink-0 font-mono text-[12px] font-black tabular-nums">
                {r.points.toLocaleString("en-US")}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-hairline px-4 py-2.5 font-mono text-[9.5px] leading-relaxed text-muted">
        Standings are illustrative sample data — arcade Play Points are stored on your device and are
        not claimable.
      </p>
    </section>
  );
}

/* ------------------------------- Lucky Spin ------------------------------- */

function LuckySpin({
  state,
  update,
}: {
  state: PlayState;
  update: (fn: (prev: PlayState) => PlayState) => void;
}) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const available = canSpinToday(state);

  const gradient = useMemo(() => {
    const step = 360 / WHEEL.length;
    const stops = WHEEL.map((_, i) => {
      const c =
        i % 2 === 0
          ? "color-mix(in srgb, var(--fb-primary) 26%, transparent)"
          : "color-mix(in srgb, var(--fb-accent) 16%, transparent)";
      return `${c} ${i * step}deg ${(i + 1) * step}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, []);

  const spin = () => {
    if (spinning || !available) return;
    const index = Math.floor(Math.random() * WHEEL.length);
    const step = 360 / WHEEL.length;
    const target = 360 * 5 + (360 - (index * step + step / 2));
    setSpinning(true);
    setResult(null);
    setAngle((a) => a + target);
    window.setTimeout(() => {
      const won = WHEEL[index].points;
      setSpinning(false);
      setResult(won);
      update((prev) => ({
        ...prev,
        points: prev.points + won,
        spins: prev.spins + 1,
        lastSpinDay: today(),
      }));
    }, 3200);
  };

  return (
    <section className="fb-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="fb-eyebrow">Lucky Spin</p>
          <p className="mt-0.5 text-[15px] font-black">Daily wheel of fortune</p>
        </div>
        <KitIcon name="gem" size={40} glow />
      </div>

      <div className="mt-4 grid place-items-center">
        <div className="relative grid h-[220px] w-[220px] max-w-full place-items-center">
          <span
            aria-hidden
            className="absolute -top-1 z-10 h-0 w-0 border-x-[7px] border-t-[12px] border-x-transparent border-t-primary"
          />
          <div
            className="h-full w-full rounded-full border border-hairline"
            style={{
              background: gradient,
              transform: `rotate(${angle}deg)`,
              transition: spinning ? "transform 3.1s cubic-bezier(0.12, 0.75, 0.05, 1)" : undefined,
            }}
          />
          <div className="fb-inset absolute grid h-[92px] w-[92px] place-items-center rounded-full text-center">
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.1em] text-muted">
              {spinning ? "Spinning" : result != null ? "You won" : "Ready"}
            </span>
            {!spinning && result != null && (
              <span className="font-mono text-lg font-black tabular-nums text-primary">
                +{result}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={spin}
        disabled={spinning || !available}
        className="fb-glow mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[var(--fb-radius-md)] bg-primary font-mono text-[12px] font-black uppercase tracking-[0.12em] text-primary-foreground disabled:opacity-45 disabled:shadow-none"
      >
        <RotateCcw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
        {spinning ? "Spinning…" : available ? "Spin the wheel" : "Come back tomorrow"}
      </button>
    </section>
  );
}

/* ------------------------------- Challenges ------------------------------- */

function Challenges({
  state,
  update,
}: {
  state: PlayState;
  update: (fn: (prev: PlayState) => PlayState) => void;
}) {
  return (
    <section className="fb-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="fb-eyebrow">Challenges</p>
          <p className="mt-0.5 text-[15px] font-black">Daily quests</p>
        </div>
        <KitIcon name="target" size={36} />
      </div>
      <ul className="divide-y divide-hairline">
        {CHALLENGES.map((c) => {
          const done = isClaimedToday(state, c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <KitIcon name={done ? "badge" : "ticket"} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black">{c.label}</p>
                <p className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                  {c.hint} · +{c.points} pts
                </p>
              </div>
              <button
                type="button"
                disabled={done}
                onClick={() =>
                  update((prev) => ({
                    ...prev,
                    points: prev.points + c.points,
                    bestStreak: Math.max(prev.bestStreak, Object.keys(prev.claimed).length + 1),
                    claimed: { ...prev.claimed, [c.id]: today() },
                  }))
                }
                className="shrink-0 rounded-xl border border-primary/35 bg-primary/12 px-3 py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary disabled:border-hairline disabled:bg-transparent disabled:text-muted"
              >
                {done ? "Claimed" : "Claim"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------ Higher / Lower ---------------------------- */

function HigherLower({ update }: { update: (fn: (prev: PlayState) => PlayState) => void }) {
  const [current, setCurrent] = useState(50);
  const [streak, setStreak] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const guess = (dir: "higher" | "lower") => {
    const next = Math.floor(Math.random() * 100) + 1;
    const win = dir === "higher" ? next > current : next < current;
    setCurrent(next);
    if (win) {
      const s = streak + 1;
      setStreak(s);
      setMsg(`Correct — ${next}. Streak ${s}.`);
      update((prev) => ({
        ...prev,
        points: prev.points + 10,
        bestStreak: Math.max(prev.bestStreak, s),
      }));
    } else {
      setStreak(0);
      setMsg(`It was ${next}. Streak reset.`);
    }
  };

  return (
    <section className="fb-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="fb-eyebrow">Higher or Lower</p>
          <p className="mt-0.5 text-[15px] font-black">Guess the next roll</p>
        </div>
        <KitIcon name="bolt" size={38} glow />
      </div>

      <div className="fb-inset mt-4 grid place-items-center py-6">
        <p className="fb-eyebrow">Current number</p>
        <p className="mt-1 font-mono text-5xl font-black tabular-nums">{current}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          Streak {streak} · +10 pts per hit
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => guess("lower")}
          className="fb-inset min-h-[46px] font-mono text-[12px] font-black uppercase tracking-[0.1em]"
        >
          Lower
        </button>
        <button
          type="button"
          onClick={() => guess("higher")}
          className="fb-glow min-h-[46px] rounded-[var(--fb-radius-md)] bg-primary font-mono text-[12px] font-black uppercase tracking-[0.1em] text-primary-foreground"
        >
          Higher
        </button>
      </div>

      {msg && (
        <p aria-live="polite" className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-muted">
          <Gamepad2 className="h-3.5 w-3.5 text-primary" />
          {msg}
        </p>
      )}
    </section>
  );
}
