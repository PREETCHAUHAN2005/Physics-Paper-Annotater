// Deterministic suggestions, not model predictions or calibrated probabilities.
import type { DifficultyOut, LanguageOut, MathOut, TaxonomyOut } from "@/lib/schemas";

export const CHAPTER_KEYWORDS: Record<string, string[]> = {
  "Units and Measurements": ["dimensional", "planck", "unit of", "significant figure", "least count", "vernier"],
  "Motion in a Straight Line": ["velocity", "displacement", "acceleration", "uniform", "retardation", "freely falling"],
  "Motion in a Plane": ["projectile", "angle", "range of", "trajectory", "relative velocity"],
  "Laws of Motion": ["friction", "newton", "block of mass", "incline", "tension", "normal reaction", "coefficient of"],
  "Work, Energy and Power": ["kinetic energy", "work done", "power", "potential energy", "conservative"],
  "System of Particles and Rotational Motion": ["rotational", "moment of inertia", "torque", "rolling", "angular", "hinge", "rigid"],
  "Gravitation": ["satellite", "gravitation", "orbital", "kepler", "escape velocity", "geostationary"],
  "Mechanical Properties of Solids": ["young's modulus", "stress", "strain", "elastic", "bulk modulus"],
  "Mechanical Properties of Fluids": ["viscosity", "surface tension", "bernoulli", "capillary", "fluid", "pressure"],
  "Thermal Properties of Matter": ["thermal expansion", "conduction", "calorimetry", "specific heat", "latent"],
  "Thermodynamics": ["carnot", "isothermal", "adiabatic", "entropy", "efficiency", "heat engine", "reservoir"],
  "Kinetic Theory of Gases": ["kinetic theory", "rms speed", "degrees of freedom", "mean free path", "ideal gas"],
  "Oscillations": ["pendulum", "simple harmonic", "oscillation", "spring", "amplitude", "time period"],
  "Waves": ["wavelength", "frequency", "doppler", "wave", "sonometer", "resonance tube"],
  "Electric Charges and Fields": ["electric field", "charge", "coulomb", "dipole", "gauss", "flux"],
  "Electrostatic Potential and Capacitance": ["capacitor", "capacitance", "potential difference", "dielectric", "equipotential"],
  "Current Electricity": ["resistance", "ohm", "circuit", "current", "emf", "wheatstone", "kirchhoff", "resistivity"],
  "Moving Charges and Magnetism": ["magnetic field", "biot-savart", "ampere", "cyclotron", "moving charge", "solenoid"],
  "Magnetism and Matter": ["bar magnet", "magnetic dipole", "paramagnet", "ferromagnet", "hysteresis"],
  "Electromagnetic Induction": ["induction", "lenz", "faraday", "induced emf", "self-inductan", "mutual inductan", "flux"],
  "Alternating Current": ["ac circuit", "lcr", "resonance", "power factor", "rms", "alternating", "impedance"],
  "Electromagnetic Waves": ["electromagnetic wave", "displacement current", "maxwell", "poynting"],
  "Ray Optics and Optical Instruments": ["lens", "mirror", "focal length", "refraction", "convex", "concave", "prism", "image"],
  "Wave Optics": ["young's double slit", "interference", "diffraction", "polarization", "fringe", "coherence"],
  "Dual Nature of Radiation and Matter": ["de broglie", "photoelectric", "work function", "photon", "threshold"],
  "Atoms": ["bohr", "hydrogen atom", "rydberg", "energy level", "spectral"],
  "Nuclei": ["radioactiv", "half-life", "nuclear", "fission", "fusion", "decay", "mass defect"],
  "Semiconductor Electronics": ["semiconductor", "diode", "transistor", "p-n", "doping", "logic gate"],
  "Communication Systems": ["modulation", "antenna", "signal", "bandwidth", "amplitude modulation"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "").replace(/[-‐‑–—]/g, " ").replace(/\s+/g, " ");
}

const GENERIC = new Set(["velocity", "uniform", "angle", "power", "pressure", "frequency", "wave", "charge", "flux", "current", "image", "signal", "threshold", "elastic", "amplitude"]);
const EXTRA: Record<string, string[]> = {
  "Units and Measurements": ["dimensions", "measurement uncertainty", "dimensional analysis", "मात्रक", "विमीय"],
  "Motion in a Straight Line": ["straight line", "free fall", "त्वरण", "विस्थापन"],
  "Motion in a Plane": ["circular motion", "centripetal", "प्रक्षेप्य"],
  "Laws of Motion": ["newtons law", "घर्षण", "न्यूटन"],
  "Work, Energy and Power": ["conservation of energy", "कार्य", "गतिज ऊर्जा"],
  "System of Particles and Rotational Motion": ["centre of mass", "center of mass", "angular momentum", "बल आघूर्ण"],
  "Gravitation": ["gravitational", "गुरुत्वाकर्षण"],
  "Mechanical Properties of Solids": ["young modulus", "youngs modulus", "प्रत्यास्थता"],
  "Mechanical Properties of Fluids": ["buoyancy", "archimedes", "दाब"],
  "Thermal Properties of Matter": ["heat transfer", "ऊष्मीय प्रसार"],
  "Thermodynamics": ["first law of thermodynamics", "ऊष्मागतिकी"],
  "Kinetic Theory of Gases": ["gas molecules", "गैसों का अणुगति सिद्धांत"],
  "Oscillations": ["shm", "सरल आवर्त", "दोलन"],
  "Waves": ["standing wave", "ध्वनि", "डॉप्लर"],
  "Electric Charges and Fields": ["विद्युत क्षेत्र", "कूलॉम"],
  "Electrostatic Potential and Capacitance": ["संधारित्र", "धारिता"],
  "Current Electricity": ["ohms law", "विद्युत धारा", "प्रतिरोध"],
  "Moving Charges and Magnetism": ["lorentz", "चुंबकीय बल"],
  "Magnetism and Matter": ["magnetic susceptibility", "चुंबकीय पदार्थ"],
  "Electromagnetic Induction": ["induced current", "प्रेरित", "फैराडे"],
  "Alternating Current": ["प्रत्यावर्ती", "प्रतिबाधा"],
  "Electromagnetic Waves": ["विद्युत चुंबकीय तरंग"],
  "Ray Optics and Optical Instruments": ["snells law", "लेंस", "दर्पण", "अपवर्तन"],
  "Wave Optics": ["youngs double slit", "व्यतिकरण", "विवर्तन"],
  "Dual Nature of Radiation and Matter": ["photo electric", "प्रकाश विद्युत", "डी ब्रॉग्ली"],
  "Atoms": ["hydrogen spectrum", "बोर", "परमाणु"],
  "Nuclei": ["half life", "radioactive", "नाभिक", "रेडियोधर्मी"],
  "Semiconductor Electronics": ["अर्धचालक", "डायोड"],
  "Communication Systems": ["संचार", "मॉडुलन"],
};

export function taxonomyEvidence(stem: string) {
  const text = normalize(stem);
  const ranked = Object.entries(CHAPTER_KEYWORDS).map(([chapter, original]) => {
    const matches = [...new Set([...original, ...(EXTRA[chapter] ?? [])])].filter((keyword) => {
      const k = normalize(keyword).replace(/[.*+?^\$\{\}()|[\]\\]/g, "\\$&");
      return new RegExp("(?:^|[^\\p{L}\\p{N}])" + k + "(?:s|al|ion)?(?=$|[^\\p{L}\\p{N}])", "u").test(text);
    });
    const points = matches.reduce((total, word) => total + (GENERIC.has(word) ? 0.5 : 2 + (word.includes(" ") ? 1 : 0)), 0);
    return { chapter, matches, points };
  }).sort((a, b) => b.points - a.points);
  const best = ranked[0];
  const runner = ranked[1];
  const ambiguous = best.points === 0 || best.points - runner.points < 1;
  return {
    chapter: best.points ? best.chapter : "Unclassified",
    concepts: best.matches.slice(0, 4),
    alternatives: ranked.filter((item) => item.points > 0).slice(0, 3),
    ambiguous,
    evidenceScore: best.points ? Math.min(0.8, Math.round((0.3 + best.points * 0.045 + (ambiguous ? 0 : 0.1)) * 100) / 100) : 0,
  };
}

export function heuristicTaxonomy(stem: string, _sampleIdx = 0): TaxonomyOut {
  const evidence = taxonomyEvidence(stem);
  return { chapter: evidence.chapter, concepts: evidence.concepts };
}

export function heuristicDifficulty(stem: string, _sampleIdx = 0): DifficultyOut {
  const phrase = stem.trim().slice(0, 90);
  const recall = /\b(define|what is|state the|unit of|dimensional formula)\b/i.test(stem);
  const complex = /\b(derive|prove|compare|combined|simultaneous|multi.step)\b/i.test(stem);
  return {
    difficulty: recall ? "easy" : complex ? "hard" : "medium",
    bloom: recall ? "remember" : complex ? "analyze" : "apply",
    difficulty_rationale: 'Rule-based estimate from "' + phrase + '". A reviewer should confirm the required reasoning steps.',
  };
}

export function heuristicMath(stem: string): MathOut {
  const latex = [...stem.matchAll(/\$\$?([^$]+)\$\$?|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g)]
    .map((match) => (match[1] ?? match[2] ?? match[3]).trim());
  return { latex, has_equation: latex.length > 0 || /[=∑∫√^²³]/.test(stem) };
}

export function heuristicLanguage(stem: string): LanguageOut {
  const words = stem.trim().split(/\s+/).filter(Boolean);
  const dev = words.filter((word) => /[\u0900-\u097f]/.test(word)).length;
  if (dev) {
    const ratio = dev / (words.length || 1);
    return { language: ratio >= 0.6 ? "hi" : "hinglish", code_mix_ratio: Math.round(ratio * 100) / 100 };
  }
  const hindi = words.filter((word) => /^(hai|hoga|hogi|kya|kaise|kyon|nahi|aur|agar|jab|tab|raha|rahe)$/i.test(word)).length;
  const ratio = hindi / (words.length || 1);
  return { language: ratio > 0.08 ? "hinglish" : "en", code_mix_ratio: ratio > 0.08 ? Math.round(ratio * 100) / 100 : 0 };
}
