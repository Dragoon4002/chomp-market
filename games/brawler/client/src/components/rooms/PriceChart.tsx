export function PriceChart({ pts }: { pts: number[] }) {
  const W = 300, H = 150, p = pts.length > 1 ? pts : [pts[0] ?? 0.5, pts[0] ?? 0.5];
  const dev = Math.max(0.05, ...p.map((v) => Math.abs(v - 0.5)));
  const x = (i: number) => (i / (p.length - 1)) * W, y = (v: number) => H / 2 - ((v - 0.5) / dev) * (H / 2 - 8);
  let up = '', down = '';
  for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1], p[i]];
    const seg = (x0: number, v0: number, x1: number, v1: number) => {
      const d = `M${x0.toFixed(1)} ${y(v0).toFixed(1)}L${x1.toFixed(1)} ${y(v1).toFixed(1)}`;
      if (v0 + v1 >= 1) up += d; else down += d;
    };
    if ((a - 0.5) * (b - 0.5) < 0) { // crosses even: split so each half gets its colour
      const t = (0.5 - a) / (b - a), xm = x(i - 1) + t * (x(i) - x(i - 1));
      seg(x(i - 1), a, xm, 0.5); seg(xm, 0.5, x(i), b);
    } else seg(x(i - 1), a, x(i), b);
  }
  return (
    <svg className="perp-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Price now ${Math.round(p[p.length - 1] * 100)}%`}>
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="even" />
      <path d={up} className="up" /><path d={down} className="down" />
    </svg>
  );
}
