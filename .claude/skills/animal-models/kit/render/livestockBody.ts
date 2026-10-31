import type { AnimalGenome, AnimalSex } from '../sim/animals/Animal.ts';
import type { AnimalStage } from '../sim/animals/Species.ts';
import { capsule, carve, ellipsoid, type Mass, type V3 } from './sdfMesh.ts';

/*
 * The bodies of cows and sheep: a skeleton and the clay masses sculpted over it (see sdfMesh.ts).
 * Proportions follow the old small landraces: a cow about 1.15 m at the withers, a ewe about
 * 0.62 m. Everything is laid out in root space (forward +Z, up +Y, the ground at y = 0) in units
 * of the withers height H, then scaled to metres.
 *
 * Skeleton: hips → spine → chest → neck → neck2 → head → jaw; three tail bones from the hips;
 * four legs of four bones each (upper arm or thigh, forearm or gaskin, cannon, pastern), the fore
 * legs from the chest and the hind legs from the hips. Rest rotations are identity, so each bone's
 * rest direction is just the difference of two joints.
 */

export const LB = { hips: 0, spine: 1, chest: 2, neck: 3, neck2: 4, head: 5, jaw: 6, tail: 7 } as const;
export const LTAIL = 3;
export const LLEG = LB.tail + LTAIL;
/** The udder rides up into the belly when a cow lies down. */
export const LUDDER = LLEG + 16;
export const LBONES = LUDDER + 1;
export const lleg = (leg: number, seg: number) => LLEG + leg * 4 + seg;
/** Legs: fore left, fore right, hind left, hind right. */
export const FORE = [0, 1], HIND = [2, 3];

/** Coat regions (sculpt tags). */
export const LT = { coat: 0, muzzle: 1, hoof: 2, udder: 3, switch: 4, wool: 5, face: 6, lowleg: 7, ear: 8 } as const;
export const LT_COUNT = 9;
const T = (...names: (keyof typeof LT)[]) => names.reduce((m, n) => m | (1 << LT[n]), 0);

export interface LegPlan {
  /** shoulder/hip, elbow/stifle, knee/hock, fetlock, the ground under the hoof. */
  joints: V3[];
  fore: boolean;
}

export interface QuadPlan {
  species: 'cow' | 'sheep';
  H: number;
  joints: V3[];
  parents: number[];
  legs: LegPlan[];
  masses: Mass[];
  /** The point of the muzzle (for reaching the grass) and the top of the head. */
  muzzle: V3;
  eyes: { at: V3; r: number }[];
  ears: { at: V3; dir: V3; len: number; width: number }[];
  horns: { at: V3; len: number; ram: boolean } | null;
  /** Lowest point of the belly at rest (how far the body drops to lie down). */
  belly: number;
  /** Where the tail hangs to, at rest. */
  tailTip: V3;
  /** Fleece depth at full growth (sheep), metres. */
  fleece: number;
  young: boolean;
}

/** A small deterministic hash of the genome, for per-beast variety. */
export function lookSeed(g: AnimalGenome): number {
  return (parseInt(g.coat.slice(1), 16) % 997) * 0.37 + g.size * 13 + g.build * 7 + (g.muzzle ?? 0.5) * 3;
}

export function withers(speciesId: 'cow' | 'sheep', g: AnimalGenome, stage: AnimalStage): number {
  const base = speciesId === 'cow' ? 1.08 + g.size * 0.16 : 0.56 + g.size * 0.1;
  return base * (stage === 'young' ? (speciesId === 'cow' ? 0.58 : 0.55) : 1);
}

export function quadPlan(speciesId: 'cow' | 'sheep', g: AnimalGenome, stage: AnimalStage, sex: AnimalSex): QuadPlan {
  const H = withers(speciesId, g, stage);
  const young = stage === 'young';
  const elder = stage === 'elder';
  const male = sex === 'male' && !young;
  const cow = speciesId === 'cow';
  // Young things are mostly leg and head; heavy beasts are wider; an old one is bonier and dips in the back.
  const wide = (0.92 + g.build * 0.16) * (young ? 0.86 : 1) * (male ? 1.08 : 1);
  const legLen = young ? 1.12 : 1;
  const headS = young ? 1.28 : 1;
  const sway = elder ? 0.025 : 0;
  const P = (x: number, y: number, z: number): V3 => [x * H, y * H, z * H];

  // --- the skeleton (units of H) ---------------------------------------------------------
  // A leg is drawn from its root to the ground; the body sits on top at the legs' length.
  const lift = (legLen - 1) * 0.5;
  const Y = (y: number) => y + lift;
  const s = cow
    ? {
        hips: [0, Y(0.9), -0.4], spine: [0, Y(0.88) - sway, -0.05], chest: [0, Y(0.86), 0.32],
        neck: [0, Y(0.84), 0.52], neck2: [0, Y(0.93), 0.7], head: [0, Y(1.0), 0.86], jaw: [0, Y(0.86), 0.97],
        tail: [[0, Y(0.94), -0.66], [0, Y(0.64), -0.73], [0, Y(0.36), -0.73]], tip: [0, Y(0.17), -0.72],
        fore: [[0.13, Y(0.74), 0.42], [0.14, Y(0.47), 0.33], [0.13, 0.25 * legLen, 0.38], [0.13, 0.065, 0.39], [0.13, 0, 0.43]],
        hind: [[0.14, Y(0.8), -0.44], [0.16, Y(0.54), -0.33], [0.13, 0.3 * legLen, -0.58], [0.13, 0.065, -0.54], [0.13, 0, -0.51]],
      }
    : {
        hips: [0, Y(0.92), -0.36], spine: [0, Y(0.9) - sway, -0.04], chest: [0, Y(0.88), 0.27],
        neck: [0, Y(0.86), 0.42], neck2: [0, Y(0.97), 0.55], head: [0, Y(1.05), 0.66], jaw: [0, Y(0.94), 0.75],
        tail: [[0, Y(0.9), -0.58], [0, Y(0.64), -0.66], [0, Y(0.45), -0.66]], tip: [0, Y(0.33), -0.65],
        fore: [[0.1, Y(0.72), 0.33], [0.11, Y(0.48), 0.27], [0.1, 0.26 * legLen, 0.31], [0.1, 0.06, 0.31], [0.1, 0, 0.34]],
        hind: [[0.11, Y(0.78), -0.37], [0.12, Y(0.55), -0.28], [0.1, 0.3 * legLen, -0.47], [0.1, 0.06, -0.43], [0.1, 0, -0.41]],
      };
  const joints: V3[] = [];
  const parents: number[] = [];
  const put = (i: number, p: number[], parent: number) => { joints[i] = P(p[0], p[1], p[2]); parents[i] = parent; };
  put(LB.hips, s.hips, -1);
  put(LB.spine, s.spine, LB.hips);
  put(LB.chest, s.chest, LB.spine);
  put(LB.neck, s.neck, LB.chest);
  put(LB.neck2, s.neck2, LB.neck);
  put(LB.head, s.head, LB.neck2);
  put(LB.jaw, s.jaw, LB.head);
  s.tail.forEach((p, i) => put(LB.tail + i, p, i ? LB.tail + i - 1 : LB.hips));
  const legs: LegPlan[] = [];
  for (let l = 0; l < 4; l++) {
    const fore = l < 2;
    const side = l % 2 === 0 ? 1 : -1;
    const src = fore ? s.fore : s.hind;
    const lj = src.map((p) => P(p[0] * side * wide, p[1], p[2]));
    legs.push({ joints: lj, fore });
    for (let k = 0; k < 4; k++) {
      joints[lleg(l, k)] = lj[k];
      parents[lleg(l, k)] = k ? lleg(l, k - 1) : fore ? LB.chest : LB.hips;
    }
  }

  // --- the masses ------------------------------------------------------------------------
  const m: Mass[] = [];
  const W = (x: number) => x * wide;
  const coatT = cow ? T('coat') : T('coat', 'wool');
  const at = (x: number, y: number, z: number) => P(x, Y(y), z);
  if (cow) {
    // Barrel, ribs, brisket and rump; the angular hips and pin bones of a working cow.
    m.push(ellipsoid(at(0, 0.7, -0.04), P(W(0.26), 0.24, 0.52), LB.spine, coatT));
    m.push(ellipsoid(at(0, 0.72, 0.3), P(W(0.22), 0.25, 0.26), LB.chest, coatT, 0.08 * H));
    m.push(ellipsoid(at(0, 0.55, 0.43), P(W(0.12), 0.12, 0.12), LB.chest, coatT, 0.06 * H));
    m.push(ellipsoid(at(0, 0.78, -0.42), P(W(0.22), 0.17, 0.24), LB.hips, coatT, 0.08 * H));
    m.push(capsule(at(0, 0.88 - sway * 0.5, -0.62), at(0, 0.885 - sway, 0.34), 0.07 * H, 0.08 * H, LB.spine, coatT, 0.1 * H));
    m.push(ellipsoid(at(0, 0.9, 0.36), P(0.09, 0.08, 0.14), LB.chest, coatT, 0.08 * H));
    for (const sd of [-1, 1]) {
      m.push(ellipsoid(at(sd * W(0.18), 0.86, -0.36), P(0.06, elder ? 0.055 : 0.045, 0.06), LB.hips, coatT, 0.06 * H));
      m.push(ellipsoid(at(sd * W(0.08), 0.865, -0.64), P(0.045, 0.04, 0.045), LB.hips, coatT, 0.05 * H));
    }
    m.push(ellipsoid(at(0, 0.9, -0.64), P(0.05, 0.05, 0.06), LB.hips, coatT, 0.04 * H));
    m.push(ellipsoid(at(0, 0.58, -0.08), P(W(0.25), 0.14, 0.36), LB.spine, coatT, 0.1 * H));
    // Neck: short and deep, with the dewlap hanging under it and a crest on a bull.
    m.push(ellipsoid(at(0, 0.83, 0.58), P(W(0.13), 0.17, 0.16), LB.neck, coatT, 0.08 * H, [0.6, 0, 0]));
    m.push(ellipsoid(at(0, 0.92, 0.74), P(W(0.1), 0.13, 0.13), LB.neck2, coatT, 0.07 * H, [0.5, 0, 0]));
    m.push(ellipsoid(at(0, 0.66, 0.58), P(0.04, male ? 0.15 : 0.12, 0.15), LB.neck, coatT, 0.06 * H, [0.4, 0, 0]));
    if (male) m.push(ellipsoid(at(0, 0.98, 0.62), P(W(0.09), 0.08, 0.18), LB.neck, coatT, 0.08 * H, [0.35, 0, 0]));
  } else {
    // Under the wool a sheep is slight: the fleece (a morph, see LivestockAvatar) does the rest.
    m.push(ellipsoid(at(0, 0.68, -0.03), P(W(0.17), 0.18, 0.4), LB.spine, coatT));
    m.push(ellipsoid(at(0, 0.7, 0.25), P(W(0.15), 0.19, 0.2), LB.chest, coatT, 0.07 * H));
    m.push(ellipsoid(at(0, 0.73, -0.35), P(W(0.16), 0.16, 0.19), LB.hips, coatT, 0.07 * H));
    m.push(capsule(at(0, 0.84, -0.52), at(0, 0.84, 0.28), 0.07 * H, 0.07 * H, LB.spine, coatT, 0.08 * H));
    m.push(ellipsoid(at(0, 0.58, -0.04), P(W(0.16), 0.12, 0.3), LB.spine, coatT, 0.08 * H));
    m.push(ellipsoid(at(0, 0.84, 0.48), P(W(0.085), 0.12, 0.12), LB.neck, coatT, 0.13 * H, [0.75, 0, 0]));
    m.push(ellipsoid(at(0, 0.95, 0.57), P(W(0.07), 0.09, 0.09), LB.neck2, coatT, 0.08 * H, [0.6, 0, 0]));
  }

  // --- the head --------------------------------------------------------------------------
  // Built about the poll, then scaled for the young (a calf's or lamb's big head).
  const hp = joints[LB.head];
  const HD = (x: number, y: number, z: number): V3 => {
    const o = cow ? [0, Y(1.0), 0.86] : [0, Y(1.05), 0.66];
    return [hp[0] + (x - o[0]) * H * headS, hp[1] + (y - o[1]) * H * headS, hp[2] + (z - o[2]) * H * headS];
  };
  const hr = (x: number, y: number, z: number): V3 => [x * H * headS, y * H * headS, z * H * headS];
  const eyes: QuadPlan['eyes'] = [];
  const ears: QuadPlan['ears'] = [];
  let muzzle: V3;
  const faceT = cow ? T('coat', 'face') : T('face');
  if (cow) {
    // A broad, flat forehead between wide-set eyes, narrowing down a long face to a square muzzle.
    m.push(ellipsoid(HD(0, Y(0.985), 0.9), hr(0.115, 0.1, 0.1), LB.head, faceT, 0.05 * H));
    m.push(ellipsoid(HD(0, Y(0.955), 0.96), hr(0.122, 0.12, 0.055), LB.head, faceT, 0.05 * H, [0.95, 0, 0]));
    m.push(capsule(HD(0, Y(0.925), 0.97), HD(0, Y(0.81), 1.16), 0.088 * H * headS, 0.066 * H * headS, LB.head, faceT, 0.05 * H, 0.82));
    for (const sd of [-1, 1]) m.push(ellipsoid(HD(sd * 0.064, Y(0.865), 0.99), hr(0.042, 0.07, 0.085), LB.head, faceT, 0.04 * H));
    m.push(ellipsoid(HD(0, Y(0.79), 1.195), hr(0.078, 0.06, 0.058), LB.head, T('muzzle', 'face'), 0.04 * H));
    m.push(ellipsoid(HD(0, Y(0.775), 1.08), hr(0.058, 0.04, 0.11), LB.jaw, faceT, 0.03 * H, [0.45, 0, 0]));
    m.push(ellipsoid(HD(0, Y(0.752), 1.165), hr(0.048, 0.033, 0.048), LB.jaw, T('muzzle', 'face'), 0.02 * H));
    for (const sd of [-1, 1]) {
      // The orbit stands out from the side of the head; the eye sits in it, looking out and forward.
      m.push(ellipsoid(HD(sd * 0.1, Y(0.97), 0.94), hr(0.034, 0.034, 0.04), LB.head, faceT, 0.025 * H));
      m.push(carve(HD(sd * 0.034, Y(0.785), 1.25), 0.014 * H * headS, 0.008 * H, LB.head));
      eyes.push({ at: HD(sd * 0.124, Y(0.972), 0.948), r: 0.021 * H * headS });
      ears.push({ at: HD(sd * 0.125, Y(0.985), 0.885), dir: [sd, -0.25, -0.5], len: 0.16 * H * headS, width: 0.075 * H * headS });
    }
    // The poll: a ridge between the horns.
    m.push(capsule(HD(-0.07, Y(1.02), 0.885), HD(0.07, Y(1.02), 0.885), 0.03 * H * headS, 0.03 * H * headS, LB.head, faceT, 0.03 * H));
    muzzle = HD(0, Y(0.76), 1.25);
  } else {
    m.push(ellipsoid(HD(0, Y(1.04), 0.665), hr(0.072, 0.08, 0.085), LB.head, T('face'), 0.04 * H));
    // A wedge of a face, deep at the cheeks and narrowing to a small, neat muzzle.
    m.push(capsule(HD(0, Y(1.0), 0.7), HD(0, Y(0.9), 0.82), 0.062 * H * headS, 0.04 * H * headS, LB.head, faceT, 0.04 * H));
    for (const sd of [-1, 1]) m.push(ellipsoid(HD(sd * 0.04, Y(0.96), 0.72), hr(0.03, 0.05, 0.05), LB.head, faceT, 0.03 * H));
    // The slight Roman nose of the old breeds.
    m.push(ellipsoid(HD(0, Y(0.97), 0.765), hr(0.04, 0.035, 0.06), LB.head, faceT, 0.03 * H, [0.75, 0, 0]));
    m.push(ellipsoid(HD(0, Y(0.885), 0.835), hr(0.036, 0.034, 0.032), LB.head, T('muzzle', 'face'), 0.022 * H));
    m.push(ellipsoid(HD(0, Y(0.885), 0.78), hr(0.03, 0.024, 0.055), LB.jaw, faceT, 0.02 * H, [0.6, 0, 0]));
    for (const sd of [-1, 1]) {
      m.push(ellipsoid(HD(sd * 0.055, Y(1.01), 0.7), hr(0.026, 0.028, 0.03), LB.head, faceT, 0.02 * H));
      m.push(carve(HD(sd * 0.018, Y(0.895), 0.866), 0.008 * H * headS, 0.005 * H, LB.head));
      eyes.push({ at: HD(sd * 0.073, Y(1.015), 0.705), r: 0.017 * H * headS });
      // Ears out level to the sides, just behind the eyes.
      ears.push({ at: HD(sd * 0.068, Y(1.035), 0.66), dir: [sd, -0.08, -0.12], len: 0.12 * H * headS, width: 0.05 * H * headS });
    }
    muzzle = HD(0, Y(0.87), 0.865);
  }

  // --- legs ------------------------------------------------------------------------------
  for (let l = 0; l < 4; l++) {
    const { joints: j, fore } = legs[l];
    const b = (k: number) => lleg(l, k);
    const k = (v: number) => v * H * (young ? 0.95 : 1) * (cow ? 1 : 0.95);
    const thick = cow ? 1 : 0.82;
    if (fore) {
      m.push(capsule(j[0], j[1], k(0.085) * wide, k(0.064) * wide, b(0), coatT, 0.06 * H));
      m.push(capsule(j[1], j[2], k(0.06) * thick, k(0.04) * thick, b(1), T('coat', 'lowleg'), 0.04 * H));
    } else {
      m.push(capsule(j[0], j[1], k(0.1) * wide, k(0.07) * wide, b(0), coatT, 0.07 * H));
      m.push(capsule(j[1], j[2], k(0.062) * thick, k(0.038) * thick, b(1), T('coat', 'lowleg'), 0.04 * H));
      // The point of the hock.
      m.push(ellipsoid([j[2][0], j[2][1] + k(0.01), j[2][2] - k(0.02)], [k(0.03), k(0.045), k(0.04)], b(2), T('coat', 'lowleg'), 0.02 * H));
    }
    m.push(ellipsoid(j[2], [k(0.042) * thick, k(0.05), k(0.045) * thick], b(2), T('coat', 'lowleg'), 0.02 * H));
    m.push(capsule(j[2], j[3], k(0.033) * thick, k(0.03) * thick, b(2), T('lowleg'), 0.02 * H));
    m.push(ellipsoid(j[3], [k(0.036) * thick, k(0.034), k(0.038) * thick], b(3), T('lowleg'), 0.015 * H));
    const toe: V3 = [j[4][0], j[4][1] + k(0.03), j[4][2]];
    m.push(capsule(j[3], toe, k(0.03) * thick, k(0.033) * thick, b(3), T('lowleg'), 0.012 * H));
    // Cloven hooves: two claws, and the dew claws behind the fetlock.
    for (const c of [-1, 1]) {
      m.push(ellipsoid([j[4][0] + c * k(0.021) * thick, j[4][1] + k(0.028), j[4][2] + k(0.008)], [k(0.022) * thick, k(0.03), k(0.046)], b(3), T('hoof'), 0.008 * H, [-0.3, 0, c * 0.08]));
      m.push(ellipsoid([j[3][0] + c * k(0.016), j[3][1] - k(0.005), j[3][2] - k(0.034)], [k(0.01), k(0.012), k(0.012)], b(3), T('hoof'), 0.004 * H));
    }
  }

  // --- udder, tail -----------------------------------------------------------------------
  joints[LUDDER] = at(0, 0.5, -0.4);
  parents[LUDDER] = LB.hips;
  if (cow && sex === 'female' && !young) {
    const full = elder ? 0.9 : 1;
    m.push(ellipsoid(at(0, 0.45, -0.4), P(W(0.12) * full, 0.09 * full, 0.15), LUDDER, T('udder'), 0.05 * H));
    for (const sd of [-1, 1]) m.push(ellipsoid(at(sd * 0.05, 0.41, -0.4), P(0.07, 0.08, 0.12), LUDDER, T('udder'), 0.03 * H));
    for (const sd of [-1, 1]) for (const z of [-0.34, -0.46]) m.push(capsule(at(sd * 0.048, 0.36, z), at(sd * 0.05, 0.29, z + 0.005), 0.016 * H, 0.012 * H, LUDDER, T('udder'), 0.012 * H));
  }
  const tj = [joints[LB.tail], joints[LB.tail + 1], joints[LB.tail + 2], P(s.tip[0], Y(s.tip[1]), s.tip[2])];
  if (cow) {
    m.push(capsule(tj[0], tj[1], 0.034 * H, 0.022 * H, LB.tail, coatT, 0.03 * H));
    m.push(capsule(tj[1], tj[2], 0.02 * H, 0.016 * H, LB.tail + 1, coatT, 0.004 * H));
    m.push(capsule(tj[2], tj[3], 0.016 * H, 0.014 * H, LB.tail + 2, coatT, 0.004 * H));
    m.push(ellipsoid([tj[3][0], tj[3][1] + 0.02 * H, tj[3][2]], P(0.034, 0.09, 0.034), LB.tail + 2, T('switch'), 0.02 * H));
  } else {
    // Long, woolly tails: the old breeds were never docked.
    m.push(capsule(tj[0], tj[1], 0.05 * H, 0.04 * H, LB.tail, coatT, 0.03 * H));
    m.push(capsule(tj[1], tj[2], 0.04 * H, 0.032 * H, LB.tail + 1, coatT, 0.006 * H));
    m.push(capsule(tj[2], tj[3], 0.032 * H, 0.024 * H, LB.tail + 2, coatT, 0.006 * H));
  }

  const horns = (g.horns ?? 0) > 0 ? { at: cow ? HD(0.085, Y(1.03), 0.885) : HD(0.05, Y(1.07), 0.655), len: (g.horns ?? 0) * (cow ? 0.4 : male ? 0.6 : 0.3) * H * headS * (young ? 0.3 : 1), ram: !cow && male } : null;
  return {
    species: speciesId,
    H,
    joints,
    parents,
    legs,
    masses: m,
    muzzle,
    eyes,
    ears,
    horns,
    belly: (cow ? Y(0.44) : Y(0.46)) * H,
    tailTip: tj[3],
    fleece: cow ? 0 : H * 0.15 * (0.7 + g.coatLength * 0.4) * (young ? 0.6 : 1),
    young,
  };
}
