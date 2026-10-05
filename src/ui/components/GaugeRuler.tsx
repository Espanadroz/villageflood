const W = 92;
const H = 176;
const PAD = 12;
const SPAN = 2; // metres shown

/**
 * A staff-gauge board: tick marks every 0.1 m, numbered every 0.5 m, the reading as a line.
 * Deliberately neutral — no normal/watch/danger zones are drawn here; those only appear as a text badge
 * once the committee has set thresholds.
 */
export function GaugeRuler({ value }: { value: number }) {
  if (!Number.isFinite(value)) return null;
  const lo = Math.floor((value - SPAN * 0.45) * 10) / 10;
  const y = (v: number) => H - PAD - ((v - lo) / SPAN) * (H - PAD * 2);
  const ticks: { v: number; major: boolean }[] = [];
  for (let i = 0; i <= SPAN * 10; i++) {
    const v = Math.round((lo + i / 10) * 10) / 10;
    ticks.push({ v, major: Math.round(v * 10) % 5 === 0 });
  }
  const ly = y(value);
  return (
    <svg className="gauge__ruler" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      <rect x="0.75" y={PAD} width="38" height={H - PAD * 2} rx="3" fill="var(--surface)" stroke="var(--line)" />
      <rect className="ruler-water" x="1.5" y={ly} width="36.5" height={Math.max(0, H - PAD - ly)} />
      {ticks.map(({ v, major }) => (
        <g key={v}>
          <line className={major ? 'ruler-tick ruler-tick--major' : 'ruler-tick'} x1="39" x2={major ? 23 : 31} y1={y(v)} y2={y(v)} />
          {major && <text className="ruler-label" x="45" y={y(v) + 3.5}>{v.toFixed(1)}</text>}
        </g>
      ))}
      <line className="ruler-line" x1="0" x2="42" y1={ly} y2={ly} />
      <circle className="ruler-pin" cx="42" cy={ly} r="4.5" />
    </svg>
  );
}
