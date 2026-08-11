import { cn } from "@/lib/utils";
import type { SideMetrics, AccuracyStat, PhaseStat } from "@/lib/supabase/matches";

const PHASE_TARGET = { early: 1, mid: 1.5, late: 2 } as const;
const ADV_FIELD_TARGET = 3;

function accPct({ hits, batons }: AccuracyStat): number | null {
  return batons > 0 ? Math.round((hits / batons) * 100) : null;
}
function effRatio({ felled, batons }: PhaseStat): number | null {
  return batons > 0 ? felled / batons : null;
}
const batonLabel = (n: number) => `${n} baton${n === 1 ? "" : "s"}`;

function Tile({
  label,
  value,
  sub,
  met,
}: {
  label: string;
  value: string;
  sub?: string;
  met?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-3 py-2.5">
      <div className="eyebrow text-[9px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "display mt-0.5 text-2xl tabular-nums",
          met && "text-[var(--dark-forest)] dark:text-[var(--chart-3)]",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

function phaseTile(label: string, stat: PhaseStat, target: number) {
  const r = effRatio(stat);
  return (
    <Tile
      label={label}
      value={r === null ? "—" : r.toFixed(1)}
      sub={`≥${target} · ${batonLabel(stat.batons)}`}
      met={r !== null && r >= target}
    />
  );
}

/**
 * Renders one side's throwing metrics: 8m baseline accuracy + phase field efficiency,
 * advantage-line accuracy + field efficiency, and a combined baseline-doubles line.
 * Rates show their denominator inline; empty samples render as "—".
 */
export function StatsBlock({ metrics }: { metrics: SideMetrics }) {
  const e = metrics.eight_meter;
  const a = metrics.advantage;
  const e8Acc = accPct(e.baseline_accuracy);
  const aAcc = accPct(a.baseline_accuracy);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="eyebrow text-[10px] tracking-[1.3px] text-muted-foreground">8 METER</div>
        <Tile
          label="BASELINE ACCURACY"
          value={e8Acc === null ? "—" : `${e8Acc}%`}
          sub={`${batonLabel(e.baseline_accuracy.batons)} at baseline`}
        />
        <div className="eyebrow text-[9px] text-muted-foreground">
          FIELD EFFICIENCY · KUBBS / BATON
        </div>
        <div className="grid grid-cols-3 gap-2">
          {phaseTile("EARLY (≤4)", e.field_efficiency.early, PHASE_TARGET.early)}
          {phaseTile("MID (5–7)", e.field_efficiency.mid, PHASE_TARGET.mid)}
          {phaseTile("LATE (8+)", e.field_efficiency.late, PHASE_TARGET.late)}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="eyebrow text-[10px] tracking-[1.3px] text-muted-foreground">
          ADVANTAGE LINE
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="BASELINE ACCURACY"
            value={aAcc === null ? "—" : `${aAcc}%`}
            sub={batonLabel(a.baseline_accuracy.batons)}
          />
          {phaseTile("FIELD EFFICIENCY", a.field_efficiency, ADV_FIELD_TARGET)}
        </div>
      </section>

      <div className="flex items-baseline justify-between rounded-xl border border-border/60 bg-background px-3 py-2.5">
        <div className="eyebrow text-[10px] text-muted-foreground">BASELINE DOUBLES</div>
        <div className="display text-xl tabular-nums">
          {e.baseline_doubles + a.baseline_doubles}
          <span className="ml-2 font-mono text-[10px] font-normal not-italic text-muted-foreground">
            {e.baseline_doubles} · 8m &nbsp;│&nbsp; {a.baseline_doubles} · adv
          </span>
        </div>
      </div>
    </div>
  );
}
