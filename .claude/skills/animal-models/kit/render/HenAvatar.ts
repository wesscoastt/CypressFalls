import * as THREE from 'three';
import type { AnimalActivity, AnimalGenome, AnimalSex } from '../sim/animals/Animal.ts';
import type { AnimalStage } from '../sim/animals/Species.ts';
import { capsule, diffuseWeights, ellipsoid, meshNeighbours, sculpt, type Mass, type V3 } from './sdfMesh.ts';
import { valueNoise } from './LivestockAvatar.ts';
import { lookSeed } from './livestockBody.ts';

/**
 * A hen (or a cockerel, or a chick): a sculpted, skinned body of feathers with the head, comb,
 * wattles, beak, eyes, scaly legs and toes as small parts. A cockerel carries a tall comb, long
 * wattles, golden hackles and sickle feathers; a chick is a ball of down.
 *
 * Animation is procedural: the walk is a two-beat step driven by the distance travelled (feet
 * planted, the head held still in the air and then thrust forward, as hens do); pecking tips the
 * body and jabs the beak to the ground; at night she settles down on her folded legs with her head
 * sunk into her shoulders; a dust bath is a wriggle low on the ground with the wings shaking.
 * Between times the head turns in quick jerks to look about, one eye at a time. Forward is +Z.
 */

const HB = { body: 0, neck: 1, neck2: 2, head: 3, tail: 4, wingL: 5, wingR: 6 } as const;
const HLEG = 7;
const HBONES = HLEG + 6;
const hleg = (leg: number, seg: number) => HLEG + leg * 3 + seg;
const TG = { body: 0, wing: 1, tail: 2, neck: 3, head: 4, breast: 5 } as const;
const TG_COUNT = 6;
const T = (...n: (keyof typeof TG)[]) => n.reduce((m, k) => m | (1 << TG[k]), 0);

const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const col = (h: string) => new THREE.Color(h);

const geoCache = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.Material>();
function shared<M extends THREE.Material>(key: string, make: () => M): M {
  let m = mats.get(key) as M | undefined;
  if (!m) { m = make(); m.userData.shared = true; mats.set(key, m); }
  return m;
}

interface HenPlan {
  S: number;
  joints: V3[];
  parents: number[];
  masses: Mass[];
  head: V3;
  /** Leg joints per leg: knee (top of the drumstick), hock, foot (on the ground). */
  legs: V3[][];
  chick: boolean;
  male: boolean;
}

function henPlan(g: AnimalGenome, stage: AnimalStage, sex: AnimalSex): HenPlan {
  const chick = stage === 'young';
  const male = sex === 'male' && !chick;
  const S = (chick ? 0.42 : 1) * (male ? 1.15 : 1) * (0.92 + g.size * 0.16);
  const P = (x: number, y: number, z: number): V3 => [x * S, y * S, z * S];
  const joints: V3[] = [];
  const parents: number[] = [];
  const put = (i: number, p: V3, parent: number) => { joints[i] = p; parents[i] = parent; };
  // A chick is round and short-necked, with big feet and a big head.
  const ny = chick ? 0.9 : 1;
  put(HB.body, P(0, 0.19, -0.01), -1);
  put(HB.neck, P(0, 0.25 * ny, 0.075), HB.body);
  put(HB.neck2, P(0, 0.32 * ny, 0.1), HB.neck);
  put(HB.head, P(0, 0.375 * ny, 0.115), HB.neck2);
  put(HB.tail, P(0, 0.24, -0.11), HB.body);
  put(HB.wingL, P(0.07, 0.24, 0.04), HB.body);
  put(HB.wingR, P(-0.07, 0.24, 0.04), HB.body);
  const legs: V3[][] = [];
  for (let l = 0; l < 2; l++) {
    const sd = l === 0 ? 1 : -1;
    const lj = [P(sd * 0.042, 0.15, 0.02), P(sd * 0.04, chick ? 0.075 : 0.085, -0.012), P(sd * 0.04, 0, 0.012)];
    legs.push(lj);
    lj.forEach((p, k) => put(hleg(l, k), p, k ? hleg(l, k - 1) : HB.body));
  }
  const m: Mass[] = [];
  const fluff = chick ? 1.15 : 1;
  // The body: a teardrop tipped up at the tail, a full breast, soft thighs.
  m.push(ellipsoid(P(0, 0.195, -0.015), P(0.083 * fluff, 0.08 * fluff, 0.125), HB.body, T('body'), 0, [-0.28, 0, 0]));
  m.push(ellipsoid(P(0, 0.195, 0.055), P(0.072 * fluff, 0.078, 0.07), HB.body, T('breast'), 0.03 * S));
  m.push(ellipsoid(P(0, 0.255, -0.06), P(0.064, 0.045, 0.08), HB.body, T('body'), 0.03 * S, [-0.45, 0, 0]));
  m.push(ellipsoid(P(0, 0.145, -0.01), P(0.068, 0.05, 0.075), HB.body, T('breast'), 0.03 * S));
  for (let l = 0; l < 2; l++) m.push(ellipsoid(P((l ? -1 : 1) * 0.042, 0.135, 0.005), P(0.032, 0.045, 0.04), hleg(l, 0), T('breast'), 0.02 * S));
  if (!chick) {
    // Tail: a hen's is a short upright fan; a cockerel's arches high.
    m.push(ellipsoid(P(0, male ? 0.31 : 0.29, -0.14), P(0.022, male ? 0.1 : 0.075, 0.05), HB.tail, T('tail'), 0.03 * S, [male ? -0.75 : -0.55, 0, 0]));
    // Wings folded against the sides.
    for (const sd of [1, -1]) m.push(ellipsoid(P(sd * 0.072, 0.212, -0.03), P(0.024, 0.058, 0.098), sd > 0 ? HB.wingL : HB.wingR, T('wing'), 0.012 * S, [-0.18, 0, sd * 0.08]));
  }
  // Neck and head: the hackle feathers bush out a little at the base.
  m.push(capsule(P(0, 0.235, 0.06), joints[HB.neck2], 0.046 * S * fluff, 0.033 * S, HB.neck, T('neck'), 0.03 * S));
  m.push(capsule(joints[HB.neck2], P(0, 0.365 * ny, 0.112), 0.033 * S, 0.03 * S, HB.neck2, T('neck'), 0.015 * S));
  const hs = chick ? 1.25 : 1;
  const head = joints[HB.head];
  const HD = (x: number, y: number, z: number): V3 => [head[0] + x * S * hs, head[1] + y * S * hs, head[2] + z * S * hs];
  m.push(ellipsoid(HD(0, 0.008, 0.008), [0.026 * S * hs, 0.028 * S * hs, 0.034 * S * hs], HB.head, T('head'), 0.012 * S));
  return { S, joints, parents, masses: m, head: HD(0, 0.008, 0.008), legs, chick, male };
}

/** Feather colour at a vertex: the breed's pattern over the body, hackles and tail. */
function featherColour(plan: HenPlan, g: AnimalGenome, p: V3, t: Float32Array, seed: number, out: THREE.Color): THREE.Color {
  const S = plan.S;
  const x = p[0] / S, y = p[1] / S, z = p[2] / S;
  const base = col(g.coat), second = col(g.secondary);
  if (plan.chick) {
    // Down: pale yellow for a white or cuckoo hen's chick, striped chipmunk-brown for the rest.
    const pale = g.type === 'white_hen' || g.type === 'cuckoo';
    out.set(pale ? '#efdf8a' : '#c8a46a');
    if (!pale) out.lerp(col('#5a3d22'), smooth((y - 0.21) * 30) * (Math.abs(x) < 0.02 ? 1 : 0.4));
    return out.multiplyScalar(0.94 + valueNoise(x * 60, y * 60, z * 60) * 0.12);
  }
  out.copy(base);
  if (g.pattern === 'spotted') {
    // Speckled: a white tip on many feathers, more over the back and wings.
    const n = valueNoise(x * 85 + seed, y * 85, z * 85);
    if (n > 0.68 - t[TG.wing] * 0.1) out.copy(second);
  } else if (g.pattern === 'ticked') {
    // Cuckoo: soft grey bars across the feathers.
    const bar = Math.sin((y * 1.2 + z * 0.4) * 150 + valueNoise(x * 30, y * 30, z * 30) * 3);
    out.lerp(second, smooth(bar * 2) * 0.75);
  } else {
    out.lerp(second, t[TG.wing] * 0.35 + t[TG.tail] * 0.6);
  }
  // A cockerel's hackles and saddle shine gold-red over the darker body; tails are near black.
  if (plan.male) {
    const gold = g.type === 'white_hen' ? col('#f4ecd8') : g.type === 'black_hen' ? col('#1d2a24') : col('#c9782a');
    out.lerp(gold, t[TG.neck] * 0.85 + smooth((y - 0.26) * 30) * t[TG.body] * 0.4);
    out.lerp(g.type === 'white_hen' ? col('#ece6d6') : col('#14201a'), t[TG.tail] * 0.85);
  } else {
    out.lerp(base.clone().lerp(col('#e8c590'), g.type === 'red_hen' ? 0.25 : 0), t[TG.neck] * 0.4);
  }
  out.multiplyScalar(0.92 + valueNoise(x * 140 + seed, y * 140, z * 140) * 0.16);
  return out;
}

export class HenAvatar {
  readonly root = new THREE.Group();
  readonly headAnchor = new THREE.Object3D();
  private plan: HenPlan;
  private bones: THREE.Bone[] = [];
  private seed: number;
  private clock = 0;
  private moveW = 0;
  private runW = 0;
  private gaitDist = 0;
  private lastDist = 0;
  private lie = 0;
  private peck = 0;
  private bodyPitch = 0;
  private neckA = 0;
  private headA = 0;
  private headYaw = 0;
  private yawGoal = 0;
  private nextGlance = 0;
  private flap = 0;
  private flapAt = 6;
  private eyes: THREE.Mesh[] = [];
  private blinkT = -1;
  private blinkAt = 2;
  private lookTarget: THREE.Vector3 | null = null;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();
  private readonly beakTip = new THREE.Object3D();
  /** Body pitch, neck and head angles of a peck that puts the beak on the ground, and of the look between pecks. */
  private jab: [number, number, number] = [0.6, 1.2, 0.5];
  private poise: [number, number, number] = [0.3, 0.3, 0.2];

  constructor(g: AnimalGenome, stage: AnimalStage, sex: AnimalSex = 'female') {
    const plan = henPlan(g, stage, sex);
    this.plan = plan;
    this.seed = lookSeed(g);
    const S = plan.S;
    for (let i = 0; i < HBONES; i++) {
      const b = new THREE.Bone();
      b.name = `hen-bone-${i}`;
      this.bones.push(b);
    }
    plan.parents.forEach((p, i) => {
      const j = plan.joints[i];
      const pj = p >= 0 ? plan.joints[p] : [0, 0, 0];
      this.bones[i].position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      (p >= 0 ? this.bones[p] : this.root).add(this.bones[i]);
    });
    const key = JSON.stringify([g, stage, sex]);
    let geo = geoCache.get(key);
    if (!geo) {
      const voxel = S * 0.0075 * (plan.chick ? 1.5 : 1);
      const s = sculpt(plan.masses, voxel, TG_COUNT, { weightSoft: voxel * 2 });
      diffuseWeights(meshNeighbours(s.indices, s.positions.length / 3), s.skinIndex, s.skinWeight, 2);
      const n = s.positions.length / 3;
      // Feathers lie in layers: ruffle the surface very slightly so it isn't glassy.
      for (let i = 0; i < n; i++) {
        const x = s.positions[i * 3], y = s.positions[i * 3 + 1], z = s.positions[i * 3 + 2];
        const k = (valueNoise(x / S * 40, y / S * 40, z / S * 40) - 0.5) * S * 0.004;
        s.positions[i * 3] += s.normals[i * 3] * k; s.positions[i * 3 + 1] += s.normals[i * 3 + 1] * k; s.positions[i * 3 + 2] += s.normals[i * 3 + 2] * k;
      }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(s.skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(s.skinWeight, 4));
      geo.setIndex(new THREE.BufferAttribute(s.indices, 1));
      const colors = new Float32Array(n * 3);
      const c = new THREE.Color();
      const tags = new Float32Array(TG_COUNT);
      for (let i = 0; i < n; i++) {
        for (let t = 0; t < TG_COUNT; t++) tags[t] = s.tagWeights[i * TG_COUNT + t];
        featherColour(plan, g, [s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2]], tags, this.seed, c);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeBoundingSphere();
      geoCache.set(key, geo);
      if (geoCache.size > 30) geoCache.delete(geoCache.keys().next().value!);
    }
    const sheen = g.type === 'black_hen';
    const body = new THREE.SkinnedMesh(geo, shared(`hen-feathers-${sheen}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: sheen ? 0.5 : 0.88 })));
    body.name = 'hen-body';
    body.castShadow = true;
    body.frustumCulled = false;
    this.root.add(body);
    this.root.updateMatrixWorld(true);
    body.bind(new THREE.Skeleton(this.bones));

    // Head parts, in the head bone's space.
    const head = this.bones[HB.head];
    const hj = plan.joints[HB.head];
    const L = (p: V3) => new THREE.Vector3(p[0] - hj[0], p[1] - hj[1], p[2] - hj[2]);
    const hs = plan.chick ? 1.25 : 1;
    const hc = L(plan.head);
    const red = shared('hen-comb', () => new THREE.MeshStandardMaterial({ color: '#c42b2a', roughness: 0.55 }));
    const horn = shared('hen-beak', () => new THREE.MeshStandardMaterial({ color: plan.chick ? '#e6b54a' : g.type === 'black_hen' ? '#3d3a36' : '#d8a945', roughness: 0.45 }));
    // Beak: a curved cone, the upper mandible hooked over the lower.
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.0095 * S * hs, 0.026 * S * hs, 10), horn);
    beak.rotation.x = Math.PI / 2 + 0.35;
    beak.position.set(hc.x, hc.y - 0.006 * S * hs, hc.z + 0.04 * S * hs);
    beak.scale.set(1, 1, 0.75);
    head.add(beak);
    if (!plan.chick) {
      // The single comb: a row of points, tall on a cockerel; the wattles hang below the beak.
      const combH = (plan.male ? 0.034 : 0.013) * S;
      const n = plan.male ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const pt = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), red);
        const h = combH * (0.7 + Math.sin(u * Math.PI) * 0.5);
        pt.scale.set(0.0045 * S, h * 0.6, 0.008 * S);
        pt.position.set(hc.x, hc.y + 0.026 * S + h * 0.4, hc.z + (0.028 - u * 0.045) * S);
        pt.rotation.x = -0.3 + u * 0.5;
        head.add(pt);
      }
      const base = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), red);
      base.scale.set(0.006 * S, 0.008 * S, 0.026 * S);
      base.position.set(hc.x, hc.y + 0.025 * S, hc.z + 0.005 * S);
      head.add(base);
      for (const sd of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), red);
        const wl = plan.male ? 0.02 : 0.011;
        w.scale.set(0.006 * S, wl * S, 0.009 * S);
        w.position.set(hc.x + sd * 0.006 * S, hc.y - 0.026 * S - wl * S * 0.5, hc.z + 0.03 * S);
        head.add(w);
        // Ear lobes: red, or white on the white breed.
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), g.type === 'white_hen' ? shared('hen-lobe-w', () => new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.6 })) : red);
        lobe.scale.set(0.003 * S, 0.006 * S, 0.006 * S);
        lobe.position.set(hc.x + sd * 0.025 * S, hc.y - 0.008 * S, hc.z - 0.006 * S);
        head.add(lobe);
      }
    }
    // Eyes: an orange iris round a black pupil, set on the sides of the head.
    const iris = shared(`hen-iris-${g.eye}`, () => new THREE.MeshStandardMaterial({ color: plan.chick ? '#151210' : g.eye, roughness: 0.2 }));
    const pupilMat = shared('hen-pupil', () => new THREE.MeshStandardMaterial({ color: '#0b0908', roughness: 0.1 }));
    for (const sd of [-1, 1]) {
      const r = 0.0058 * S * hs;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), iris);
      eye.position.set(hc.x + sd * 0.022 * S * hs, hc.y + 0.008 * S * hs, hc.z + 0.012 * S * hs);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), pupilMat);
      pupil.position.set(sd * r * 0.62, 0, r * 0.25);
      eye.add(pupil);
      head.add(eye);
      this.eyes.push(eye);
    }
    this.headAnchor.position.set(hc.x, hc.y, hc.z + 0.02 * S);
    head.add(this.headAnchor);
    this.beakTip.position.set(hc.x, hc.y - 0.012 * S * hs, hc.z + 0.052 * S * hs);
    head.add(this.beakTip);

    // Legs and feet: scaly shanks and four toes, three forward and one back; a spur on a cockerel.
    const legMat = shared(`hen-leg-${g.type}`, () => new THREE.MeshStandardMaterial({ color: g.type === 'black_hen' || g.type === 'cuckoo' ? (g.type === 'cuckoo' ? '#d9c79a' : '#4a4c50') : '#d6ad48', roughness: 0.6 }));
    for (let l = 0; l < 2; l++) {
      const [knee, hock, foot] = plan.legs[l];
      const shankLen = Math.hypot(hock[1] - foot[1], hock[2] - foot[2]);
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0055 * S, 0.0065 * S, shankLen, 8), legMat);
      // Along the shank bone (from the hock to the foot), in its own space.
      shank.position.set((foot[0] - hock[0]) / 2, (foot[1] - hock[1]) / 2, (foot[2] - hock[2]) / 2);
      shank.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(foot[0] - hock[0], foot[1] - hock[1], foot[2] - hock[2]).normalize());
      this.bones[hleg(l, 1)].add(shank);
      if (plan.male) {
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.003 * S, 0.014 * S, 6), legMat);
        spur.position.set(0, (foot[1] - hock[1]) * 0.55, -0.006 * S);
        spur.rotation.x = -Math.PI / 2 - 0.4;
        this.bones[hleg(l, 1)].add(spur);
      }
      const toes = new THREE.Group();
      for (const [a, len] of [[-0.45, 0.034], [0, 0.04], [0.45, 0.034], [Math.PI, 0.02]] as [number, number][]) {
        const toe = new THREE.Mesh(new THREE.CapsuleGeometry(0.0032 * S, len * S, 3, 6), legMat);
        toe.rotation.set(Math.PI / 2, 0, 0);
        const holder = new THREE.Object3D();
        holder.rotation.y = a * (l === 0 ? 1 : -1);
        toe.position.set(0, 0.002 * S, len * S * 0.5);
        holder.add(toe);
        toes.add(holder);
      }
      this.bones[hleg(l, 2)].add(toes);
      void knee;
    }
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.jab = this.solvePeck(0.008 * S, 0.65);
    this.poise = this.solvePeck(0.1 * S, 0.35);
  }

  /** Pose the neck chain (as `animate` does) and return the beak tip's height and reach. */
  private beakAt(pitch: number, neck: number, head: number): THREE.Vector3 {
    const b = this.bones;
    b[HB.body].rotation.set(pitch, 0, 0);
    b[HB.neck].rotation.set(neck, 0, 0);
    b[HB.neck2].rotation.set(neck * 0.6, 0, 0);
    b[HB.head].rotation.set(head - neck * 1.2 - pitch * 0.6, 0, 0);
    this.root.updateMatrixWorld(true);
    return this.beakTip.getWorldPosition(new THREE.Vector3());
  }

  /** Search the peck: beak to `height` metres, a little ahead of the feet, the body tipped as little as will do. */
  private solvePeck(height: number, pitchPref: number): [number, number, number] {
    const S = this.plan.S;
    const cost = (a: number[]) => {
      const p = this.beakAt(a[0], a[1], a[2]);
      return Math.pow((p.y - height) / S, 2) * 400 + Math.pow((a[0] - pitchPref), 2) * 0.5 + (a[1] * a[1] + a[2] * a[2]) * 0.02 + Math.pow(Math.min(0, p.z - 0.06 * S) / S, 2) * 200;
    };
    let best = [pitchPref, 1, 0.4];
    let bc = cost(best);
    for (let step = 0.3; step > 0.003; step *= 0.6) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
          const t = best.slice();
          t[k] = clamp(t[k] + sd * step, k === 0 ? 0 : -0.8, k === 0 ? 1.1 : 2.2);
          const c = cost(t);
          if (c < bc) { bc = c; best = t; improved = true; }
        }
      }
    }
    this.beakAt(0, 0, 0);
    return best as [number, number, number];
  }

  setProduce(_p: number): void {}

  lookAt(p: THREE.Vector3 | null): void {
    this.lookTarget = p ? (this.lookTarget ?? new THREE.Vector3()).copy(p) : null;
  }

  animate(activity: AnimalActivity, moving: boolean, running: boolean, time: number, dt: number, distanceWalked = 0, _traits: readonly string[] = []): void {
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    const S = this.plan.S;
    const b = this.bones;
    const j = this.plan.joints;
    const t = time + this.seed;
    this.moveW = damp(this.moveW, moving ? 1 : 0, 10, dt);
    this.runW = damp(this.runW, moving && running ? 1 : 0, 6, dt);
    const settled = !moving && (activity === 'sleep' || activity === 'lie' || activity === 'roll');
    const pecking = !moving && activity === 'graze' || !moving && activity === 'eat' || !moving && activity === 'drink';
    this.lie = damp(this.lie, settled ? 1 : 0, 3, dt);
    const stepD = Math.max(0, distanceWalked - this.lastDist);
    this.lastDist = distanceWalked;
    if (stepD < 1) this.gaitDist += stepD;
    const C = S * (0.24 + this.runW * 0.16);
    const phase = this.gaitDist / C;

    // Pecking: a jab to the ground every second or so, a look round in between.
    let jab = 0;
    if (pecking) {
      const u = (t * 1.4) % 1;
      // A quick jab with a moment's hold at the bottom.
      jab = u < 0.26 ? Math.min(1, Math.sin((u / 0.26) * Math.PI) * 1.35) : 0;
      if (activity === 'drink') jab = Math.max(jab, 0.6);
    }
    this.peck = damp(this.peck, pecking ? 1 : 0, 5, dt);
    // Glances: the head snaps to a new angle, holds, snaps again (a bird looks with one eye).
    if (this.clock > this.nextGlance) {
      this.nextGlance = this.clock + 0.4 + valueNoise(this.clock * 3, this.seed, 1) * 1.6;
      let goal = (valueNoise(this.clock * 7, 2, this.seed) - 0.5) * 1.8;
      if (this.lookTarget && !settled) {
        this.root.updateMatrixWorld(true);
        const lp = this.root.worldToLocal(this.tmpV.copy(this.lookTarget));
        // Turned side-on, so one eye is on them.
        goal = clamp(Math.atan2(lp.x, lp.z) + (valueNoise(this.clock, 9, 1) > 0.5 ? 0.6 : -0.6), -1.4, 1.4);
      }
      this.yawGoal = goal;
    }
    this.headYaw = damp(this.headYaw, settled ? 0 : this.yawGoal * (1 - this.peck * 0.7) * (1 - this.moveW * 0.8), 22, dt);

    // Head bob while walking: the head stays put, then shoots forward with each step.
    const stepPh = (phase * 2) % 1;
    const bob = this.moveW * (1 - this.runW) * (stepPh < 0.75 ? 0.5 - stepPh / 0.75 : -0.5 + (stepPh - 0.75) / 0.25);
    const lerp = THREE.MathUtils.lerp;
    const pk = (k: number) => lerp(this.poise[k], this.jab[k], jab) * this.peck;
    const bodyPitch = pk(0) + this.moveW * 0.12 + this.runW * 0.15 - this.lie * 0.1;
    this.bodyPitch = damp(this.bodyPitch, bodyPitch, pecking ? 32 : 8, dt);
    const neckTarget = pk(1) + bob * 0.35 - this.lie * 0.5;
    this.neckA = damp(this.neckA, neckTarget, pecking ? 30 : 12, dt);
    this.headA = damp(this.headA, pk(2) - bob * 0.3 + this.lie * 0.3, 24, dt);

    // Body height: on her legs, or settled down on them (sleeping, or wriggled into a dust bath).
    const legsY = j[HB.body][1];
    const sitY = 0.108 * S;
    const roll = activity === 'roll' && !moving ? Math.sin(t * 9) * 0.35 * this.lie : 0;
    const wobble = this.moveW * Math.sin(phase * Math.PI * 2) * 0.08;
    b[HB.body].position.set(0, THREE.MathUtils.lerp(legsY, sitY, this.lie) - this.moveW * Math.abs(Math.sin(phase * Math.PI * 2)) * 0.006 * S, j[HB.body][2]);
    b[HB.body].rotation.set(this.bodyPitch, 0, wobble + roll);
    // Fluffed up for sleep.
    const fluff = 1 + this.lie * (activity === 'sleep' ? 0.1 : 0.03);
    b[HB.body].scale.set(fluff, fluff, 1);
    b[HB.neck].rotation.set(this.neckA, this.headYaw * 0.4, 0);
    b[HB.neck2].rotation.set(this.neckA * 0.6, this.headYaw * 0.3, 0);
    b[HB.head].rotation.set(this.headA - this.neckA * 1.2 - this.bodyPitch * 0.6 + (activity === 'sleep' ? 0.3 : 0), this.headYaw * 0.4, this.peck ? 0 : Math.sin(t * 0.7) * 0.15);
    b[HB.tail].rotation.set(-this.moveW * 0.1 + Math.sin(t * 0.9) * 0.03, 0, 0);

    // Wings: folded; flapped now and then (a stretch, a run, a dust bath).
    if (this.clock > this.flapAt) { this.flap = 0.01; this.flapAt = this.clock + 8 + valueNoise(this.clock, 4, this.seed) * 20; }
    if (this.flap > 0) { this.flap += dt / 0.8; if (this.flap > 1) this.flap = 0; }
    const flapA = (this.flap > 0 ? Math.sin(this.flap * Math.PI * 4) * Math.sin(this.flap * Math.PI) * 0.9 : 0) + this.runW * (0.35 + Math.sin(t * 22) * 0.25) + (activity === 'roll' && !moving ? this.lie * (0.35 + Math.sin(t * 30) * 0.2) : 0);
    b[HB.wingL].rotation.set(0, 0, flapA);
    b[HB.wingR].rotation.set(0, 0, -flapA);

    // Legs: two-beat stepping with planted feet; folded flat under her when settled.
    this.root.updateMatrixWorld(true);
    const inv = this.tmpM.copy(this.root.matrixWorld).invert();
    const duty = THREE.MathUtils.lerp(0.62, 0.42, this.runW);
    for (let l = 0; l < 2; l++) {
      const [knee, hock, foot] = this.plan.legs[l];
      const ph = (((phase + l * 0.5) % 1) + 1) % 1;
      const sweep = C * duty;
      let fz = 0, fy = 0;
      if (ph < duty) fz = sweep * (0.5 - ph / duty);
      else {
        const u = (ph - duty) / (1 - duty);
        fz = sweep * (-0.5 + smooth(u));
        fy = Math.sin(u * Math.PI) * S * 0.035;
      }
      fz *= this.moveW;
      fy *= this.moveW;
      const top = b[hleg(l, 0)].getWorldPosition(this.tmpV).applyMatrix4(inv);
      const l0 = Math.hypot(knee[1] - hock[1], knee[2] - hock[2]);
      const l1 = Math.hypot(hock[1] - foot[1], hock[2] - foot[2]);
      // Drumstick slopes back from the knee, shank forward from the hock (the hock behind the line).
      const tz = foot[2] + fz, ty = Math.max(0, fy);
      const dy = top.y - ty, dzz = tz - top.z;
      const d = clamp(Math.hypot(dy, dzz), Math.abs(l0 - l1) + 1e-4, l0 + l1 - 1e-4);
      const base = Math.atan2(dzz, dy);
      const a = Math.acos(clamp((l0 * l0 + d * d - l1 * l1) / (2 * l0 * d), -1, 1));
      let up = base - a;
      const my = top.y - l0 * Math.cos(up), mz = top.z + l0 * Math.sin(up);
      let lo = Math.atan2(tz - mz, my - ty);
      // Settled: drumstick tucked forward, shank flat back under the body.
      up = THREE.MathUtils.lerp(up, 0.9, this.lie);
      lo = THREE.MathUtils.lerp(lo, -1.35, this.lie);
      const rest0 = Math.atan2(hock[2] - knee[2], knee[1] - hock[1]);
      const rest1 = Math.atan2(foot[2] - hock[2], hock[1] - foot[1]);
      const w0 = -(up - rest0), w1 = -(lo - rest1);
      b[hleg(l, 0)].rotation.set(w0 - this.bodyPitch, 0, 0);
      b[hleg(l, 1)].rotation.set(w1 - w0, 0, 0);
      // Toes stay flat on the ground (curled up a little in the swing).
      b[hleg(l, 2)].rotation.set(-w1 + clamp(fy / (0.03 * S), 0, 1) * 0.5, 0, 0);
    }

    // Blinking (a quick upward blink of the lower lid): flatten the eye a moment; shut asleep.
    if (this.clock > this.blinkAt) { this.blinkT = 0; this.blinkAt = this.clock + 1.5 + valueNoise(this.clock, 7, 3) * 4; }
    let open = 1;
    if (this.blinkT >= 0) { this.blinkT += dt; open = Math.abs(this.blinkT - 0.06) / 0.06; if (this.blinkT > 0.12) this.blinkT = -1; }
    if (activity === 'sleep' && !moving) open = 0.1;
    for (const e of this.eyes) e.scale.set(1, Math.max(0.1, Math.min(1, open)), 1);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    });
  }
}
