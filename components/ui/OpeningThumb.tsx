import type { ReactNode } from "react";
import type { OpeningStyle } from "@/lib/types";

// Front-elevation blueprint icons, 48x48. Hairline strokes in currentColor;
// the accent colour marks only the one detail that identifies each style.
const A = "var(--accent)";
const FILL = 0.14;

const Wall = () => (
  <g opacity={0.45}>
    <path d="M3 4v40M6 4v40M42 4v40M45 4v40" />
  </g>
);
const Floor = () => <path d="M2 44h44" opacity={0.6} />;
const Glass = (p: { x: number; y: number; w: number; h: number }) => (
  <rect {...p} fill="currentColor" fillOpacity={FILL} />
);
const Knob = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.2} />;
const Arrow = ({ d }: { d: string }) => <path d={d} stroke={A} />;
// Swing "V": apex on the hinge side, opens toward the handle side.
const V = ({ x1, x2, y1, y2 }: { x1: number; x2: number; y1: number; y2: number }) => (
  <path d={`M${x2} ${y1}L${x1} ${(y1 + y2) / 2}L${x2} ${y2}`} stroke={A} strokeDasharray="2 1.5" />
);

// Standard door: 22 x 38 at x 13..35.
const DR = { x: 13, y: 6, w: 22, h: 38 };

const ICONS: Record<OpeningStyle, ReactNode> = {
  single: (
    <>
      <Wall /><Floor />
      <rect {...DR} /><Glass {...{ x: 15, y: 8, w: 18, h: 34 }} />
      <Knob x={31} y={26} />
      <V x1={13} x2={35} y1={6} y2={44} />
    </>
  ),
  double: (
    <>
      <Wall /><Floor />
      <rect x={6} y={6} width={36} height={38} /><path d="M24 6v38" />
      <Glass {...{ x: 8, y: 8, w: 14, h: 34 }} /><Glass {...{ x: 26, y: 8, w: 14, h: 34 }} />
      <Knob x={21} y={26} /><Knob x={27} y={26} />
      <path d="M6 6l9 19L6 44M42 6l-9 19 9 19" stroke={A} strokeDasharray="2 1.5" />
    </>
  ),
  slidingGlass: (
    <>
      <Wall /><Floor />
      <rect x={6} y={8} width={36} height={36} />
      <rect x={6} y={8} width={20} height={36} /><Glass {...{ x: 6, y: 8, w: 20, h: 36 }} />
      <rect x={22} y={8} width={20} height={36} /><Glass {...{ x: 22, y: 8, w: 20, h: 36 }} />
      <Arrow d="M14 26h14M25 23l3 3-3 3" />
    </>
  ),
  french: (
    <>
      <Wall /><Floor />
      <rect x={8} y={6} width={32} height={38} /><path d="M24 6v38" />
      <path d="M16 6v38M32 6v38M8 19h32M8 32h32" opacity={0.7} />
      <Glass {...{ x: 8, y: 6, w: 32, h: 38 }} />
      <path d="M8 6l9 19-9 19M40 6l-9 19 9 19" stroke={A} strokeDasharray="2 1.5" />
    </>
  ),
  sidelight: (
    <>
      <Wall /><Floor />
      <rect x={9} y={6} width={20} height={38} /><rect x={29} y={6} width={9} height={38} />
      <Glass {...{ x: 29, y: 6, w: 9, h: 38 }} />
      <Knob x={26} y={26} />
      <V x1={9} x2={29} y1={6} y2={44} />
    </>
  ),
  pocket: (
    <>
      <Wall /><Floor />
      <path d="M4 5h40" /><path d="M24 9h20v35H24" opacity={0.7} strokeDasharray="2 2" />
      <rect x={14} y={9} width={20} height={35} fill="currentColor" fillOpacity={FILL} />
      <Knob x={17} y={28} />
      <Arrow d="M20 5l-4 0M24 3l-3 2 3 2" />
    </>
  ),
  folding: (
    <>
      <Wall /><Floor />
      <rect x={5} y={14} width={38} height={30} />
      <path d="M5 14l5 5 5-5 5 5 5-5 5 5 5-5 5 5" stroke={A} />
      <path d="M10 19v25M20 19v25M30 19v25M40 19v25" opacity={0.7} />
      <Glass {...{ x: 5, y: 19, w: 38, h: 25 }} />
    </>
  ),
  arch: (
    <>
      <Wall /><Floor />
      <path d="M13 44V18a11 11 0 0 1 22 0v26" />
      <path d="M17 44V19a7 7 0 0 1 14 0v25" opacity={0.4} />
      <path d="M24 4v3" stroke={A} />
    </>
  ),
  passage: (
    <>
      <Wall /><Floor />
      <path d="M13 44V6h22v38" /><path d="M13 6h22" strokeDasharray="1.5 2" />
      <path d="M17 44h14" opacity={0.5} />
    </>
  ),
  garageSectional: (
    <>
      <Wall /><Floor />
      <rect x={5} y={12} width={38} height={32} fill="currentColor" fillOpacity={0.08} />
      <path d="M5 20h38M5 28h38M5 36h38" />
      <path d="M11 15h6M20 15h6M29 15h6" opacity={0.6} />
      <Arrow d="M24 40V25M20 29l4-4 4 4" />
    </>
  ),
  garageRoller: (
    <>
      <Wall /><Floor />
      <rect x={5} y={6} width={38} height={6} fill="currentColor" fillOpacity={0.2} />
      <rect x={5} y={12} width={38} height={32} />
      <path d="M5 16h38M5 20h38M5 24h38M5 28h38M5 32h38M5 36h38M5 40h38" opacity={0.55} />
      <Arrow d="M24 40V22M20 26l4-4 4 4" />
    </>
  ),
  gate: (
    <>
      <Floor />
      <path d="M6 44V22M42 44V22" strokeWidth={2} />
      <path d="M10 28h28M10 38h28" />
      <path d="M13 44V24M18 44V24M23 44V24M28 44V24M33 44V24M38 44V24" opacity={0.85} />
      <V x1={10} x2={38} y1={24} y2={44} />
    </>
  ),
  wicket: (
    <>
      <Floor />
      <path d="M12 44V22M36 44V22" strokeWidth={2} />
      <path d="M15 28h18M15 38h18" />
      <path d="M18 44V24M23 44V24M28 44V24M33 44V24" opacity={0.85} />
      <V x1={15} x2={33} y1={24} y2={44} />
    </>
  ),

  casement: (
    <>
      <Wall />
      <rect x={10} y={8} width={28} height={30} /><rect x={13} y={11} width={22} height={24} />
      <Glass {...{ x: 13, y: 11, w: 22, h: 24 }} />
      <path d="M13 23h22" opacity={0.7} />
      <path d="M10 38h28M8 40h32" opacity={0.6} />
      <V x1={13} x2={35} y1={11} y2={35} />
    </>
  ),
  twin: (
    <>
      <Wall />
      <rect x={6} y={10} width={36} height={28} /><path d="M24 10v28" />
      <Glass {...{ x: 8, y: 12, w: 14, h: 24 }} /><Glass {...{ x: 26, y: 12, w: 14, h: 24 }} />
      <path d="M6 38h36M4 40h40" opacity={0.6} />
      <path d="M8 12l14 12-14 12M40 12L26 24l14 12" stroke={A} strokeDasharray="2 1.5" />
    </>
  ),
  picture: (
    <>
      <Wall />
      <rect x={6} y={8} width={36} height={30} /><rect x={9} y={11} width={30} height={24} />
      <Glass {...{ x: 9, y: 11, w: 30, h: 24 }} />
      <path d="M6 38h36M4 40h40" opacity={0.6} />
      <path d="M15 31l9-14M20 31l9-14" stroke={A} />
    </>
  ),
  sliding: (
    <>
      <Wall />
      <rect x={6} y={10} width={36} height={28} />
      <rect x={8} y={12} width={18} height={24} /><Glass {...{ x: 8, y: 12, w: 18, h: 24 }} />
      <rect x={22} y={12} width={18} height={24} /><Glass {...{ x: 22, y: 12, w: 18, h: 24 }} />
      <path d="M6 38h36M4 40h40" opacity={0.6} />
      <Arrow d="M14 24h14M25 21l3 3-3 3" />
    </>
  ),
  tiltTurn: (
    <>
      <Wall />
      <rect x={10} y={8} width={28} height={30} /><rect x={13} y={11} width={22} height={24} />
      <Glass {...{ x: 13, y: 11, w: 22, h: 24 }} />
      <path d="M13 35l11-8 11 8" stroke={A} strokeDasharray="2 1.5" />
      <path d="M13 11l22 12-22 12" opacity={0.6} strokeDasharray="2 1.5" />
      <path d="M10 38h28M8 40h32" opacity={0.6} />
      <Knob x={32} y={23} />
    </>
  ),
  bay: (
    <>
      <Wall />
      <path d="M6 12l10 6v16L6 38z" /><path d="M42 12l-10 6v16l10 4z" />
      <rect x={16} y={18} width={16} height={16} />
      <path d="M6 12l10 6M42 12l-10 6M6 38l10-4M42 38l-10-4" />
      <Glass {...{ x: 16, y: 18, w: 16, h: 16 }} />
      <path d="M16 18v16M32 18v16" stroke={A} />
    </>
  ),
  arched: (
    <>
      <Wall />
      <path d="M13 42V18a11 11 0 0 1 22 0v24z" />
      <path d="M17 38V19a7 7 0 0 1 14 0v19z" fill="currentColor" fillOpacity={FILL} />
      <path d="M17 26h14" opacity={0.7} /><path d="M24 12v26" opacity={0.7} />
      <path d="M17 19h14" stroke={A} />
      <path d="M11 42h26" opacity={0.6} />
    </>
  ),
  round: (
    <>
      <Wall />
      <circle cx={24} cy={24} r={16} /><circle cx={24} cy={24} r={13} fill="currentColor" fillOpacity={FILL} />
      <path d="M24 11v26M11 24h26" opacity={0.7} />
      <circle cx={24} cy={24} r={4} stroke={A} />
    </>
  ),
  highWindow: (
    <>
      <Wall />
      <rect x={8} y={10} width={32} height={10} /><rect x={10} y={12} width={28} height={6} />
      <Glass {...{ x: 10, y: 12, w: 28, h: 6 }} />
      <path d="M17 12v6M24 12v6M31 12v6" opacity={0.7} />
      <path d="M8 20h32" opacity={0.6} />
      <path d="M14 30h20" stroke={A} strokeDasharray="2 2" />
    </>
  ),
  glassBlock: (
    <>
      <Wall />
      <rect x={10} y={10} width={28} height={28} fill="currentColor" fillOpacity={FILL} />
      <path d="M17 10v28M24 10v28M31 10v28M10 17h28M10 24h28M10 31h28" />
      <path d="M12 15l3-3M12 22l3-3" stroke={A} />
    </>
  ),
  shopfront: (
    <>
      <Wall /><Floor />
      <rect x={4} y={8} width={40} height={36} /><rect x={4} y={34} width={40} height={10} fill="currentColor" fillOpacity={0.2} />
      <path d="M17 8v26M31 8v26M4 16h40" />
      <Glass {...{ x: 4, y: 8, w: 40, h: 26 }} />
      <path d="M4 16h40" stroke={A} />
    </>
  ),
};

export default function OpeningThumb({ style, size = 56 }: { style: OpeningStyle; size?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden
      focusable={false}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[style]}
    </svg>
  );
}
