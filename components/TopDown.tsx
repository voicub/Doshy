import type { Def, Part } from "@/lib/catalog";
import { carTopView } from "@/lib/carGeometry";
import type { CarSpec } from "@/lib/cars";

type Props = { def: Def; sx?: number; sz?: number; color?: string; glowFill?: string };

/** A car from above: wheels, body outline, glasshouse (from the same lofted shape as the 3D). */
function CarTop({ spec, color }: { spec: CarSpec; color?: string }) {
  const v = carTopView(spec);
  const path = (pts: [number, number][]) => `M${pts.map(([x, z]) => `${x.toFixed(3)} ${z.toFixed(3)}`).join("L")}Z`;
  const stroke = { stroke: "var(--shade-40)", strokeWidth: 0.012 };
  return (
    <g>
      {v.wheels.map(([x, z, w, d], i) => (
        <rect key={i} x={x - w / 2} y={z - d / 2} width={w} height={d} rx={0.05} fill="#16171a" {...stroke} />
      ))}
      <path d={path(v.outline)} fill={color ?? spec.color} {...stroke} />
      <path d={path(v.cabin)} fill="#18222c" fillOpacity={0.9} {...stroke} />
    </g>
  );
}

/** Top-down silhouette of a catalog item, in metres, centred on (0,0). Used by the 2D editor and the catalog picker. */
export default function TopDown({ def, sx = 1, sz = 1, color, glowFill }: Props) {
  if (def.car) return (
    <g transform={`scale(${sx} ${sz})`}>
      <CarTop spec={def.car} color={color} />
    </g>
  );
  const parts = [...def.parts].sort((a, b) => a.p[1] + a.s[1] / 2 - (b.p[1] + b.s[1] / 2));
  return (
    <g transform={`scale(${sx} ${sz})`}>
      {parts.map((p, i) => {
        const fill = p.glow && glowFill ? glowFill : p.m && color ? color : p.c;
        const common = { fill, stroke: "var(--shade-40)", strokeWidth: 0.012 };
        const turned = (a?: number) => a !== undefined && Math.abs(Math.abs(a) - Math.PI / 2) < 0.01;
        // a cylinder lying on its side (wheel, exhaust tip) is a rectangle seen from above, not a circle
        if (p.shape === "cyl" && (turned(p.r?.[2]) || turned(p.r?.[0]))) {
          const [w, d] = turned(p.r?.[2]) ? [p.s[1], p.s[0]] : [p.s[0], p.s[1]];
          return <rect key={i} x={p.p[0] - w / 2} y={p.p[2] - d / 2} width={w} height={d} {...common} />;
        }
        if (p.veg) return <Canopy key={i} p={p} {...common} />;
        if (p.shape === "cyl" || p.shape === "sph" || p.shape === "lathe") return <ellipse key={i} cx={p.p[0]} cy={p.p[2]} rx={p.s[0] / 2} ry={p.s[0] / 2} {...common} />;
        const ry = p.r ? (-p.r[1] * 180) / Math.PI : 0;
        return <rect key={i} x={p.p[0] - p.s[0] / 2} y={p.p[2] - p.s[2] / 2} width={p.s[0]} height={p.s[2]} transform={ry ? `rotate(${ry} ${p.p[0]} ${p.p[2]})` : undefined} {...common} />;
      })}
    </g>
  );
}

const LOBES: [number, number, number][] = [[0.0, -0.02, 0.62], [-0.3, -0.22, 0.42], [0.3, -0.18, 0.4], [-0.28, 0.24, 0.4], [0.3, 0.26, 0.38], [0.02, 0.0, 0.3]];

/** A plant seen from above: a scalloped canopy (a clipped rounded bar for long, low plants such as hedges), with a trunk dot under tall trees. */
function Canopy({ p, fill, stroke, strokeWidth }: { p: Part; fill: string; stroke: string; strokeWidth: number }) {
  const [w, h, d] = p.s;
  const [x, , z] = p.p;
  if (w / d >= 2.2 || d / w >= 2.2) return <rect x={x - w / 2} y={z - d / 2} width={w} height={d} rx={Math.min(w, d) * 0.3} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  return (
    <g stroke={stroke} strokeWidth={strokeWidth}>
      <ellipse cx={x} cy={z} rx={w / 2} ry={d / 2} fill={fill} />
      {LOBES.map(([lx, lz, r], i) => (
        <ellipse key={i} cx={x + lx * w} cy={z + lz * d} rx={r * w * 0.5} ry={r * d * 0.5} fill={fill} fillOpacity={i === 5 ? 0.55 : 0.8} stroke="none" />
      ))}
      {h > 1.5 && <circle cx={x} cy={z} r={Math.min(w, d) * 0.05} fill="var(--shade-45)" stroke="none" />}
    </g>
  );
}
