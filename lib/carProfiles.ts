import type { BodyStyle, CarSpec, Roofline } from "./cars.ts";

// SIDE-VIEW, PLAN-VIEW and FRONT-VIEW profile of a car body as normalised numbers. lib/carFrame.ts lofts the body through these exactly.
// x positions are fractions of the car length measured FROM THE FRONT (0 = nose tip, 1 = tail); heights are fractions of the car height.
// The numbers are proportions of the real body styles and models (bonnet length, windscreen base and header, roof peak, where the roof
// ends and the rear glass starts); they are written by hand from side views, not traced pixel by pixel.
//
//   wb  windscreen base (bonnet ends)      wt  windscreen header      pk  roof peak      rt  roof ends, rear glass starts
//   rb  rear glass base (deck / boot starts)
//   dropF  how far the header sits below the peak (share of H)      dropR  how far the roof end sits below the peak (share of H)
//   taperF / taperR  the body is this much narrower at the nose / tail (share of the width)
//   noseR / tailR   length of the plan-view rounding of nose / tail (share of L)
//   tum  roof narrower than the shoulders, per side (share of the width): the front-view tumblehome

type SideProfile = { wb: number; wt: number; pk: number; rt: number; rb: number; dropF: number; dropR: number; taperF: number; taperR: number; noseR: number; tailR: number; tum: number };

const P = (wb: number, wt: number, pk: number, rt: number, rb: number, dropF: number, dropR: number, tum: number, extra: Partial<SideProfile> = {}): SideProfile => ({ wb, wt, pk, rt, rb, dropF, dropR, tum, taperF: 0.025, taperR: 0.04, noseR: 0.12, tailR: 0.11, ...extra });

const TEMPLATES: Record<string, SideProfile> = {
  hatchback: P(0.27, 0.4, 0.52, 0.875, 0.975, 0.02, 0.06, 0.11),
  hatch_fast: P(0.28, 0.41, 0.52, 0.84, 0.955, 0.02, 0.09, 0.11),
  sedan: P(0.3, 0.44, 0.56, 0.765, 0.805, 0.02, 0.04, 0.12),
  sedan_fast: P(0.31, 0.45, 0.57, 0.8, 0.9, 0.02, 0.09, 0.12),
  estate: P(0.27, 0.4, 0.5, 0.955, 0.985, 0.02, 0.03, 0.11),
  crossover: P(0.285, 0.415, 0.5, 0.935, 0.985, 0.035, 0.075, 0.1),
  crossover_fast: P(0.285, 0.42, 0.52, 0.89, 0.975, 0.03, 0.11, 0.1),
  suv: P(0.265, 0.385, 0.5, 0.955, 0.99, 0.025, 0.035, 0.09),
  minivan: P(0.215, 0.36, 0.47, 0.96, 0.99, 0.03, 0.03, 0.07, { taperF: 0.01 }),
  van: P(0.135, 0.225, 0.3, 0.985, 0.995, 0.01, 0.005, 0.05, { taperF: 0.005, taperR: 0.005, noseR: 0.07, tailR: 0.05 }),
  pickup: P(0.285, 0.415, 0.45, 0.665, 0.7, 0.02, 0.02, 0.1, { noseR: 0.09, tailR: 0.05 }),
  coupe: P(0.35, 0.49, 0.58, 0.8, 0.9, 0.02, 0.08, 0.14, { taperF: 0.04, taperR: 0.05 }),
  convertible: P(0.34, 0.46, 0.55, 0.8, 0.83, 0, 0, 0.12, { taperF: 0.04, taperR: 0.05 }),
  sports: P(0.37, 0.5, 0.56, 0.84, 0.975, 0.02, 0.14, 0.15, { taperF: 0.06, taperR: 0.04, noseR: 0.14 }),
  microcar: P(0.125, 0.24, 0.45, 0.93, 0.975, 0.03, 0.03, 0.07, { taperF: 0.01, taperR: 0.01, noseR: 0.07, tailR: 0.07 }),
};

/** Per-model differences from the template of its body style (ids of lib/cars.data.ts). The most popular models first. */
const MODELS: Record<string, Partial<SideProfile>> = {
  car_mitsubishi_asx_2016: { wb: 0.285, wt: 0.415, pk: 0.495, rt: 0.935, rb: 0.985, dropF: 0.035, dropR: 0.08 },
  car_mitsubishi_asx_2017_dynamic_shield: { wb: 0.29, wt: 0.42, pk: 0.5, rt: 0.935, rb: 0.985, dropF: 0.035, dropR: 0.08 },
  car_mitsubishi_outlander: { wb: 0.275, wt: 0.405, pk: 0.5, rt: 0.945, rb: 0.99, dropR: 0.06 },
  car_mitsubishi_eclipse_cross: { wt: 0.43, pk: 0.52, rt: 0.88, rb: 0.97, dropR: 0.11 },
  car_mitsubishi_l200: { wb: 0.29, wt: 0.42, rt: 0.665, rb: 0.69 },
  car_dacia_duster: { wb: 0.26, wt: 0.385, pk: 0.5, rt: 0.955, rb: 0.99, dropR: 0.02, tum: 0.085 },
  car_dacia_sandero: { wb: 0.27, wt: 0.4, rt: 0.9, rb: 0.975, dropR: 0.05 },
  car_volkswagen_golf: { wb: 0.285, wt: 0.415, pk: 0.525, rt: 0.885, rb: 0.975, dropR: 0.065 },
  car_volkswagen_golf_variant: { wb: 0.28, wt: 0.41, pk: 0.52, rt: 0.95, rb: 0.985, dropR: 0.045 },
  car_volkswagen_polo: { wb: 0.265, wt: 0.395, pk: 0.52, rt: 0.9, rb: 0.975, dropR: 0.06 },
  car_volkswagen_passat: { wb: 0.3, wt: 0.44, pk: 0.57, rt: 0.77, rb: 0.81 },
  car_volkswagen_passat_variant: { wb: 0.295, wt: 0.435, pk: 0.55, rt: 0.945, rb: 0.985, dropR: 0.03 },
  car_volkswagen_t_roc: { wb: 0.28, wt: 0.41, pk: 0.5, rt: 0.915, rb: 0.98, dropR: 0.08 },
  car_volkswagen_tiguan: { wb: 0.27, wt: 0.395, pk: 0.5, rt: 0.95, rb: 0.988, dropR: 0.05 },
  car_volkswagen_id_3: { wb: 0.255, wt: 0.395, pk: 0.5, rt: 0.9, rb: 0.975, dropR: 0.07 },
  car_volkswagen_caddy: { wb: 0.165, wt: 0.27, pk: 0.38, rt: 0.965, rb: 0.99, dropR: 0.01 },
  car_volkswagen_transporter: { wb: 0.13, wt: 0.215, pk: 0.3, rt: 0.985, rb: 0.995 },
  car_skoda_octavia: { wb: 0.29, wt: 0.43, pk: 0.54, rt: 0.85, rb: 0.93, dropR: 0.07 },
  car_skoda_octavia_combi: { wb: 0.285, wt: 0.42, pk: 0.53, rt: 0.945, rb: 0.985, dropR: 0.04 },
  car_skoda_fabia: { wb: 0.265, wt: 0.4, pk: 0.52, rt: 0.9, rb: 0.975, dropR: 0.06 },
  car_skoda_kodiaq: { wb: 0.265, wt: 0.39, pk: 0.5, rt: 0.955, rb: 0.99, dropR: 0.03 },
  car_renault_clio: { wb: 0.26, wt: 0.395, pk: 0.52, rt: 0.9, rb: 0.975, dropR: 0.055 },
  car_renault_captur: { wb: 0.27, wt: 0.4, pk: 0.5, rt: 0.915, rb: 0.98, dropR: 0.06 },
  car_toyota_yaris: { wb: 0.26, wt: 0.395, pk: 0.5, rt: 0.9, rb: 0.97, dropR: 0.07 },
  car_toyota_corolla: { wb: 0.285, wt: 0.425, pk: 0.54, rt: 0.865, rb: 0.965, dropR: 0.08 },
  car_toyota_rav4: { wb: 0.275, wt: 0.4, pk: 0.5, rt: 0.955, rb: 0.99, dropR: 0.04 },
  car_toyota_c_hr: { wb: 0.28, wt: 0.425, pk: 0.52, rt: 0.885, rb: 0.97, dropR: 0.1 },
  car_toyota_prius: { wb: 0.29, wt: 0.44, pk: 0.54, rt: 0.85, rb: 0.96, dropR: 0.08 },
  car_toyota_hilux: { wb: 0.29, wt: 0.425, pk: 0.465, rt: 0.665, rb: 0.685 },
  car_toyota_land_cruiser: { wb: 0.265, wt: 0.385, pk: 0.5, rt: 0.96, rb: 0.99, dropR: 0.02 },
  car_ford_mustang: { wb: 0.365, wt: 0.505, pk: 0.595, rt: 0.745, rb: 0.84, dropR: 0.06 },
  car_honda_civic: { wb: 0.285, wt: 0.425, pk: 0.54, rt: 0.865, rb: 0.965, dropR: 0.08 },
  car_hyundai_tucson: { wb: 0.275, wt: 0.405, pk: 0.5, rt: 0.945, rb: 0.985, dropR: 0.05 },
  car_hyundai_ioniq_5: { wb: 0.26, wt: 0.4, pk: 0.5, rt: 0.925, rb: 0.985, dropR: 0.06 },
  car_kia_ev6: { wb: 0.28, wt: 0.425, pk: 0.52, rt: 0.88, rb: 0.975, dropR: 0.1 },
  car_kia_sportage: { wb: 0.275, wt: 0.405, pk: 0.5, rt: 0.945, rb: 0.985, dropR: 0.05 },
  car_mazda_3: { wb: 0.3, wt: 0.435, pk: 0.54, rt: 0.875, rb: 0.97, dropR: 0.08 },
  car_nissan_leaf: { wb: 0.27, wt: 0.41, pk: 0.52, rt: 0.9, rb: 0.975, dropR: 0.06 },
  car_nissan_gt_r: { wb: 0.35, wt: 0.495, pk: 0.57, rt: 0.8, rb: 0.935, dropR: 0.09 },
  car_bmw_3_series: { wb: 0.3, wt: 0.445, pk: 0.565, rt: 0.765, rb: 0.805, dropR: 0.045 },
  car_bmw_x1: { wb: 0.28, wt: 0.41, pk: 0.5, rt: 0.94, rb: 0.985, dropR: 0.06 },
  car_bmw_x3: { wb: 0.28, wt: 0.41, pk: 0.5, rt: 0.94, rb: 0.985, dropR: 0.07 },
  car_bmw_x5: { wb: 0.27, wt: 0.4, pk: 0.5, rt: 0.95, rb: 0.99, dropR: 0.05 },
  car_bmw_i4: { wb: 0.3, wt: 0.445, pk: 0.56, rt: 0.82, rb: 0.935, dropR: 0.09 },
  car_tesla_model_3: { wb: 0.315, wt: 0.455, pk: 0.58, rt: 0.8, rb: 0.885, dropR: 0.1 },
  car_tesla_model_y: { wb: 0.3, wt: 0.44, pk: 0.55, rt: 0.9, rb: 0.975, dropR: 0.11 },
  car_tesla_model_s: { wb: 0.3, wt: 0.445, pk: 0.56, rt: 0.85, rb: 0.95, dropR: 0.09 },
  car_porsche_911: { wb: 0.36, wt: 0.5, pk: 0.55, rt: 0.82, rb: 0.97, dropR: 0.15 },
  car_porsche_718_boxster: { wb: 0.34, wt: 0.46, pk: 0.55, rt: 0.8, rb: 0.83 },
  car_jeep_wrangler: { wb: 0.265, wt: 0.3, pk: 0.4, rt: 0.97, rb: 0.99, dropF: 0.0, dropR: 0.0 },
  car_subaru_forester: { wb: 0.27, wt: 0.395, pk: 0.5, rt: 0.95, rb: 0.99, dropR: 0.04 },
  car_citroen_ami: { wb: 0.12, wt: 0.24, pk: 0.45, rt: 0.93, rb: 0.975 },
};

const FAST_KEY: Partial<Record<BodyStyle, string>> = { hatchback: "hatch_fast", sedan: "sedan_fast", crossover: "crossover_fast", suv: "crossover_fast", estate: "hatch_fast", minivan: "crossover_fast" };

/** The profile of a model: its body-style template (fastback or notchback variant when the roof differs), then its own numbers. */
export function profileFor(spec: CarSpec, roofline: Roofline): SideProfile {
  const style = spec.bodyStyle;
  const key = roofline === "fastback" ? FAST_KEY[style] : roofline === "notchback" && style !== "convertible" ? "sedan" : undefined;
  const base = TEMPLATES[key ?? style];
  return { ...base, ...MODELS[spec.id] };
}

