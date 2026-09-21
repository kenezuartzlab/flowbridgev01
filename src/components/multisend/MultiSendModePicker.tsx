import { ArrowRightLeft, Users, Wallet } from "lucide-react";
import type { MultiSendMode } from "@/lib/multisend/types";

const MODES: { id: MultiSendMode; title: string; sub: string; Icon: typeof Users }[] = [
  {
    id: "one-to-many",
    title: "Distribute — One → Many",
    sub: "Send from one wallet to many recipients.",
    Icon: Users,
  },
  {
    id: "many-to-one",
    title: "Consolidate — Many → One",
    sub: "Collect funds from several wallets into one destination.",
    Icon: Wallet,
  },
  {
    id: "many-to-many",
    title: "Advanced — Many → Many",
    sub: "Plan transfers between multiple wallets in one organized session.",
    Icon: ArrowRightLeft,
  },
];

export function MultiSendModePicker({
  value,
  onChange,
}: {
  value: MultiSendMode | null;
  onChange: (mode: MultiSendMode) => void;
}) {
  return (
    <div className="grid gap-2 p-4 pt-0 sm:grid-cols-3">
      {MODES.map(({ id, title, sub, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
              active
                ? "border-primary/45 bg-primary/10"
                : "border-hairline bg-card hover:border-primary/30 hover:bg-foreground/5"
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted"}`} />
            <p className="mt-2 text-[12.5px] font-black leading-tight">{title}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted">{sub}</p>
          </button>
        );
      })}
    </div>
  );
}
