import type { ReactNode } from "react";
import "./lineKindIcon.css";

// Small pictures of what the Garden lines tool draws: roads and walkways seen from above, fences and lamps from the side. Drawn in the HUD's own colours on
// a dark tile, decorative only (the text label next to the picture is the accessible name).

const GROUND = "var(--lg-16222b)";
const WHITE = "#e8f1f7";
const YELLOW = "#f2c14e";

/** A horizontal band y0..y1 across the tile, optionally with a lighter strip along each side. */
const band = (y0: number, y1: number, fill: string, extra?: ReactNode) => (
  <>
    <rect x="0" y={y0} width="60" height={y1 - y0} fill={fill} />
    {extra}
  </>
);
const dashes = (y: number, color = WHITE) => [4, 18, 32, 46].map((x) => <rect key={x} x={x} y={y - 0.8} width="8" height="1.6" fill={color} />);
const hline = (y: number, color = WHITE, w = 1.2) => <rect key={y} x="0" y={y - w / 2} width="60" height={w} fill={color} />;

/** Top-down pictures of the road and walkway kinds of lib/lineKinds.ts PATH_KINDS. */
function pathPicture(id: string): ReactNode {
  switch (id) {
    case "road_street":
      return band(5, 31, "#b9c0c8", band(10, 26, "#4a4f57", dashes(18)));
    case "road_asphalt":
      return band(8, 28, "#4a4f57", dashes(18));
    case "road_lane":
      return band(12, 24, "#555a62");
    case "road_highway":
      return band(6, 30, "#4a4f57", <>{hline(9)}{hline(27)}{dashes(18, "#9aa3ad")}</>);
    case "road_gravel":
      return band(10, 26, "#b3a58a", [6, 15, 24, 33, 42, 51].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 16 : 21} r="1.2" fill="#7d725f" />));
    case "road_cobble":
      return band(7, 29, "#8c8378", <>{hline(7, "#c9c2b8", 2)}{hline(29, "#c9c2b8", 2)}{[0, 1, 2].flatMap((r) => [0, 1, 2, 3, 4, 5].map((c) => <rect key={`${r}${c}`} x={3 + c * 9 + (r % 2) * 4} y={11 + r * 6} width="7" height="4.4" rx="1.4" fill="#6f675d" />))}</>);
    case "road_dirt":
      return band(9, 27, "#7a5a3a", <>{hline(14, "#5c4228", 2.4)}{hline(22, "#5c4228", 2.4)}</>);
    case "walk_paved":
      return band(12, 24, "#9aa3ad", [10, 20, 30, 40, 50].map((x) => <rect key={x} x={x} y="12" width="0.8" height="12" fill="#6e7781" />));
    case "walk_slabs":
      return band(11, 25, "#6e7781", [1, 20.5, 40].map((x) => <rect key={x} x={x} y="12" width="18" height="12" fill="#b8bcc2" />));
    case "walk_brick":
      return band(12, 24, "#b5655a", <>{[18, 24].map((y) => hline(y, "#7d3f38", 0.8))}{[8, 24, 40, 56].map((x) => <rect key={x} x={x} y="12" width="0.8" height="6" fill="#7d3f38" />)}{[0, 16, 32, 48].map((x) => <rect key={x} x={x} y="18" width="0.8" height="6" fill="#7d3f38" />)}</>);
    case "walk_concrete":
      return band(11, 25, "#a8a8a8", <>{hline(11.8, "#6e6e6e", 1.6)}{hline(24.2, "#6e6e6e", 1.6)}{[20, 40].map((x) => <rect key={x} x={x} y="11" width="0.8" height="14" fill="#7e7e7e" />)}</>);
    case "walk_gravel":
      return band(12, 24, "#c2b595", <>{hline(12.6, "#9aa3ad", 1.4)}{hline(23.4, "#9aa3ad", 1.4)}{[6, 17, 28, 39, 50].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 16 : 20} r="1" fill="#8a7e66" />)}</>);
    case "walk_stones":
      return [8, 22, 36, 50].map((x, i) => <ellipse key={x} cx={x} cy={i % 2 ? 15 : 21} rx="5" ry="3.6" fill="#a7adb4" stroke="#6e7781" strokeWidth="0.8" />);
    case "walk_boards":
      return band(11, 25, "#a67c52", [14.5, 18, 21.5].map((y) => hline(y, "#6d4f31", 0.7)));
    default:
      return band(12, 24, "#9aa3ad");
  }
}

const ground = hline(32, "#5b7a67", 1.6);
const post = (x: number, h = 20) => <rect key={x} x={x - 1} y={32 - h} width="2" height={h} fill="#9aa3ad" />;
const posts = (xs: number[], h?: number) => xs.map((x) => post(x, h));
const spread = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

/** Side views of the fence styles of lib/fences.ts (keyed by wall style). */
function fencePicture(style: string): ReactNode {
  switch (style) {
    case "fence_picket":
      return <>{spread(5, 55, 9).map((x) => <path key={x} d={`M${x - 2} 32V14l2-3 2 3v18z`} fill="#e8f1f7" />)}{hline(18, "#9aa3ad", 1.4)}{hline(27, "#9aa3ad", 1.4)}</>;
    case "fence_panel":
      return <><rect x="4" y="8" width="52" height="24" fill="#a67c52" />{[14, 24, 34, 44].map((x) => <rect key={x} x={x} y="8" width="0.8" height="24" fill="#6d4f31" />)}{posts([4, 56], 26)}</>;
    case "fence_slat":
      return <>{[10, 15, 20, 25, 30].map((y) => <rect key={y} x="4" y={y - 2} width="52" height="3.6" fill="#a67c52" />)}{posts([4, 56], 26)}</>;
    case "fence_wire":
      return <>{posts([5, 30, 55], 24)}{spread(8, 52, 8).map((x) => <path key={x} d={`M${x} 10l6 20M${x + 6} 10l-6 20`} stroke="#9aa3ad" strokeWidth="0.7" fill="none" />)}{hline(9.5, "#9aa3ad", 1.2)}</>;
    case "fence_bar":
      return <>{hline(11, "#9aa3ad", 1.6)}{hline(28, "#9aa3ad", 1.6)}{spread(5, 55, 13).map((x) => <rect key={x} x={x - 0.6} y="11" width="1.2" height="21" fill="#c7ced6" />)}</>;
    case "fence_iron":
      return <>{hline(14, "#2b333b", 1.8)}{hline(28, "#2b333b", 1.8)}{spread(5, 55, 11).map((x) => <g key={x}><rect x={x - 0.6} y="9" width="1.2" height="23" fill="#c7ced6" /><path d={`M${x - 1.8} 11l1.8-4 1.8 4z`} fill="#c7ced6" /></g>)}</>;
    case "fence_glass":
      return <>{[4, 31].map((x) => <rect key={x} x={x} y="9" width="25" height="23" fill="#5ad7ff" fillOpacity="0.22" stroke="#9fe6ff" strokeWidth="0.8" />)}{[5, 28, 31, 54].map((x) => <rect key={x} x={x - 0.8} y="14" width="1.6" height="3" fill="#c7ced6" />)}</>;
    case "wall_stone":
      return <>{[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={3 + c * 14 + (r % 2) * 7} y={12 + r * 7} width="12" height="6" rx="1.6" fill={(r + c) % 2 ? "#8f969e" : "#a7adb4"} />))}</>;
    case "wall_brick_low":
      return <>{[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4, 5].map((c) => <rect key={`${r}${c}`} x={3 + c * 9 + (r % 2) * 4.5} y={16 + r * 4} width="8" height="3.2" fill="#b5655a" />))}</>;
    case "wall_block":
      return <>{[0, 1].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={4 + c * 17 + (r % 2) * 8} y={14 + r * 9} width="16" height="8" fill="#b4b8be" stroke="#6e7781" strokeWidth="0.8" />))}</>;
    case "hedge":
      return <><rect x="4" y="12" width="52" height="20" rx="8" fill="#3f8a4f" />{[10, 22, 34, 46].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 18 : 22} r="2" fill="#5fb06e" />)}</>;
    case "fence_rail":
      return <>{posts([6, 30, 54], 22)}{[16, 24].map((y) => <rect key={y} x="6" y={y - 1.4} width="48" height="2.8" fill="#a67c52" />)}</>;
    case "fence_electric":
      return <>{posts([6, 30, 54], 22)}{[14, 20, 26].map((y) => <g key={y}><rect x="6" y={y - 0.4} width="48" height="0.8" fill="#f2c14e" />{[6, 30, 54].map((x) => <circle key={x} cx={x} cy={y} r="1.3" fill="#e8f1f7" />)}</g>)}</>;
    case "fence_bamboo":
      return <>{spread(6, 54, 9).map((x) => <g key={x}><rect x={x - 1.4} y="8" width="2.8" height="24" fill="#b5a642" />{[14, 22].map((y) => <rect key={y} x={x - 1.8} y={y} width="3.6" height="1" fill="#6f6a25" />)}</g>)}</>;
    default:
      return posts([6, 54]);
  }
}

/** Side views of the lamp kinds of lib/lineKinds.ts LIGHT_KINDS. */
function lightPicture(id: string): ReactNode {
  const lamp = (x: number, h: number, head: ReactNode) => (
    <>
      <rect x={x - 0.9} y={32 - h} width="1.8" height={h} fill="#9aa3ad" />
      {head}
    </>
  );
  switch (id) {
    case "light_street":
      return lamp(30, 26, <><path d="M25 8h10l-2 6h-6z" fill="#2b333b" stroke="#9aa3ad" strokeWidth="0.8" /><rect x="27" y="10" width="6" height="4" fill={YELLOW} /></>);
    case "light_pole":
      return lamp(24, 28, <><rect x="24" y="4" width="16" height="2.4" fill="#9aa3ad" /><rect x="34" y="6" width="8" height="2.6" fill={YELLOW} /></>);
    case "light_bollard":
      return <><rect x="26" y="10" width="8" height="22" rx="3" fill="#6e7781" /><rect x="26" y="13" width="8" height="4" fill={YELLOW} /></>;
    case "light_path":
      return lamp(30, 12, <path d="M22 20a8 8 0 0 1 16 0z" fill="#c7ced6" />);
    case "light_solar":
      return lamp(30, 14, <><rect x="26" y="14" width="8" height="1.6" fill="#2b4a6b" /><ellipse cx="30" cy="11" rx="3.6" ry="3.4" fill={YELLOW} fillOpacity="0.9" /></>);
    case "light_festoon":
      return <>{post(6, 22)}{post(54, 22)}<path d="M6 10Q30 28 54 10" fill="none" stroke="#9aa3ad" strokeWidth="0.8" />{[14, 22, 30, 38, 46].map((x) => <circle key={x} cx={x} cy={10 + 14 * (1 - ((x - 30) / 24) ** 2) * 0.9} r="1.8" fill={YELLOW} />)}</>;
    default:
      return lamp(30, 22, <circle cx="30" cy="9" r="3" fill={YELLOW} />);
  }
}

/** The picture of one kind: a path kind id (road_asphalt ...), a fence's wall style (fence_picket ...) or a light kind id (light_street ...). */
export default function LineKindIcon({ id, family }: { id: string; family: "road" | "walkway" | "fence" | "lights" }) {
  return (
    <svg className="line-pic" viewBox="0 0 60 36" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      <rect width="60" height="36" fill={family === "road" || family === "walkway" ? GROUND : "var(--lg-0e151b)"} />
      {family === "fence" ? <>{ground}{fencePicture(id)}</> : family === "lights" ? <>{ground}{lightPicture(id)}</> : pathPicture(id)}
    </svg>
  );
}
