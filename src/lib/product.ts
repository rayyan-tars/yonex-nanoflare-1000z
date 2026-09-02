/**
 * Centralized YONEX NANOFLARE 1000 Z product data.
 *
 * Every price, spec, and technology claim shown on the site should be read
 * from this file rather than hard-coded in a component. To change the
 * price, specs, or CTA link, edit the values below — see ASSETS.md /
 * README.md "Tuning" section for details.
 *
 * Facts are sourced from the official Yonex USA product listing
 * (https://us.yonex.com/products/nanoflare-1000-z) and the Yonex global
 * racquet page. No performance claims, test results, or endorsements are
 * invented beyond what Yonex publishes.
 */

export type WeightSpec = {
  code: string;
  grams: number;
  weight: string;
  grips: string[];
};

export type StringingSpec = {
  code: string;
  tension: string;
};

export type RecommendedString = {
  playerType: string;
  string: string;
};

export type Technology = {
  id: string;
  index: string;
  name: string;
  location: "frame" | "shaft" | "joint" | "head";
  summary: string;
};

export const PRODUCT = {
  brand: "YONEX",
  series: "NANOFLARE PERFORMANCE SERIES",
  name: "NANOFLARE 1000 Z",
  shortName: "1000 Z",
  itemCode: "NF-1000Z",
  color: "Lightning Yellow",

  tagline: "Engineered for speed.",
  positioning: "Head-light, speed-oriented racket built for explosive repulsion and lightning-fast net play.",

  price: 285,
  currency: "USD",
  priceDisplay: "$285",
  priceLabel: "Yonex USA listed price",
  priceDisclaimer: "Availability and pricing vary by region.",

  flex: "Extra Stiff",
  balance: "Head-light",

  frameMaterials: ["HM Graphite", "NANOMETRIC DR", "M40X", "EX-HYPER MG"],
  shaftMaterials: ["HM Graphite", "Ultra PE Fiber"],
  joint: "NEW Built-in T-Joint",
  length: { extraMm: 10, note: "10 mm longer than standard length" },

  weights: [
    { code: "4U", grams: 83, weight: "Avg. 83 g", grips: ["G5", "G6"] },
    { code: "3U", grams: 88, weight: "Avg. 88 g", grips: ["G4", "G5", "G6"] },
  ] satisfies WeightSpec[],

  stringingAdvice: [
    { code: "4U", tension: "20–28 lbs" },
    { code: "3U", tension: "21–29 lbs" },
  ] satisfies StringingSpec[],

  recommendedStrings: [
    { playerType: "Control players", string: "AEROBITE" },
    { playerType: "Hard hitters", string: "EXBOLT65" },
  ] satisfies RecommendedString[],

  technologies: [
    {
      id: "sonic-flare",
      index: "01",
      name: "Sonic Flare System",
      location: "frame",
      summary:
        "High-modulus graphite is placed at the frame's tip and base — EX-HYPER MG up top, M40X below — to maximize repulsion for explosive, stable acceleration through the shuttle.",
    },
    {
      id: "m40x",
      index: "02",
      name: "M40X",
      location: "frame",
      summary:
        "A strong yet elastic Toray high-modulus carbon used in the frame's base, built for stability and control under high swing speed.",
    },
    {
      id: "nanometric-dr",
      index: "03",
      name: "Nanometric DR",
      location: "frame",
      summary:
        "An enhanced graphite developed from Yonex's Nanoscience research. It combines a firm shuttle hold with high repulsion, so contact feels locked-in and explosive at once.",
    },
    {
      id: "ex-hyper-mg",
      index: "04",
      name: "EX-Hyper MG",
      location: "frame",
      summary:
        "High-modulus graphite positioned at the frame tip, working with M40X to sharpen repulsion across the whole hitting area.",
    },
    {
      id: "ultra-pe-fiber",
      index: "05",
      name: "Ultra PE Fiber",
      location: "shaft",
      summary:
        "A high-tenacity fiber woven into the shaft to suppress unwanted twisting, keeping the frame precisely aligned through impact.",
    },
    {
      id: "t-joint",
      index: "06",
      name: "NEW Built-in T-Joint",
      location: "joint",
      summary:
        "A refined internal T-joint that transfers energy from shaft to frame with minimal loss, tightening the connection between swing and shot.",
    },
  ] satisfies Technology[],

  featureNames: [
    "ISOMETRIC",
    "Sonic Flare System",
    "Solid Feel Core",
    "AERO Frame",
    "Ultra PE Fiber",
    "Super Slim Shaft",
    "Energy Boost Cap Plus",
    "TORAYCA M40X",
    "Nanometric DR",
    "Compact Frame",
    "Speed-Assist Bumper",
    "EX-Hyper MG",
  ],

  officialProductUrl: "https://us.yonex.com/products/nanoflare-1000-z",

  disclaimer:
    "Independent concept project. Not affiliated with or endorsed by YONEX.",
} as const;

export type ProductData = typeof PRODUCT;
