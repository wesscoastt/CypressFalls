import * as THREE from 'three';
import type { AnimalActivity, AnimalGenome, AnimalSex } from '../sim/animals/Animal.ts';
import type { AnimalStage } from '../sim/animals/Species.ts';
import { diffuseWeights, meshNeighbours, sculpt, type V3 } from './sdfMesh.ts';
import { LB, LBONES, LT, LT_COUNT, LTAIL, LUDDER, lleg, lookSeed, quadPlan, type QuadPlan } from './livestockBody.ts';

/**
 * A cow or a sheep, sculpted from its body plan (livestockBody.ts) as one seamless skinned surface
 * with the coat painted into its vertex colours; eyes, ears and horns are separate small parts on
 * the head. A sheep's fleece is a morph target: it grows back after shearing (`setProduce`).
 *
 * Animation is procedural, like the pets'. Each activity is a pose (how low the body sits, where
 * the head reaches, how the legs fold); walking is a four-beat lateral walk driven by the
 * distance actually travelled, so planted hooves don't slide, and running a two-beat trot. Legs
 * reach their hooves by two-bone IK with the cannon and pastern set by the gait. Grazing, eating
 * and drinking reach the muzzle to a solved height; lying folds the legs under. Secondary motion
 * (tail swishing at flies, ears flicking, the cud chewed, blinks, a glance at whoever is near)
 * plays on top. Forward is local +Z.
 */

const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Smooth value noise in 0…1 (for coat patches and the lumps of a fleece). */
function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x: number, y: number, z: number) => valueNoise(x, y, z) * 0.6 + valueNoise(x * 2.1 + 3, y * 2.1, z * 2.1) * 0.3 + valueNoise(x * 4.3, y * 4.3 + 7, z * 4.3) * 0.1;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (g) geoCache.delete(key);
  else g = build();
  geoCache.set(key, g);
  if (geoCache.size > 40) geoCache.delete(geoCache.keys().next().value!);
  return g;
}
const mats = new Map<string, THREE.Material>();
function shared<M extends THREE.Material>(key: string, make: () => M): M {
  let m = mats.get(key) as M | undefined;
  if (!m) { m = make(); m.userData.shared = true; mats.set(key, m); }
  return m;
}

const col = (hex: string) => new THREE.Color(hex);

/** Coat colour at a vertex from its tags, position (H units) and the genome. */
function coatColour(plan: QuadPlan, g: AnimalGenome, sex: AnimalSex, elder: boolean, p: V3, t: Float32Array | number[], out: THREE.Color): THREE.Color {
  const H = plan.H;
  const x = p[0] / H, y = p[1] / H, z = p[2] / H;
  const seed = lookSeed(g);
  const base = col(g.coat), second = col(g.secondary);
  const cow = plan.species === 'cow';
  const pale = base.getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
  out.copy(base);
  if (cow) {
    if (g.pattern === 'patched') {
      // Pied: big irregular patches, the legs and belly mostly white.
      const n = fbm(x * 2.4 + seed, y * 2.4, z * 2.4 + seed * 0.3);
      const lowWhite = smooth((0.42 - y) * 6) * 0.5 + t[LT.udder];
      if (n - lowWhite > 0.52) out.copy(second);
    } else if (g.pattern === 'masked') {
      // White with black points: ears, muzzle, round the eyes and the feet.
      const eye = plan.eyes.reduce((d, e) => Math.min(d, Math.hypot(p[0] - e.at[0], p[1] - e.at[1], p[2] - e.at[2])), 9) / H;
      const dark = Math.max(t[LT.muzzle], smooth((0.11 - y) * 25), smooth((0.05 - eye) * 40), t[LT.ear]);
      out.lerp(second, dark);
    } else {
      // Solid: darker along the topline and down the legs, lighter under the belly.
      out.lerp(second, clamp(t[LT.lowleg] * 0.5 + smooth((y - 0.86) * 8) * 0.25, 0, 1));
      if (!pale) out.lerp(col('#e2c9a6'), smooth((0.55 - y) * 6) * (1 - t[LT.lowleg]) * 0.18);
    }
    // The nose pad: pink on a red, dun or white cow, slate on a black one.
    const darkCoat = base.getHSL({ h: 0, s: 0, l: 0 }).l < 0.18 || g.pattern === 'masked';
    // Only the bare, moist pad at the very front of the muzzle, with a soft edge into the hair.
    const nose = darkCoat ? col('#2b2523') : col('#b8877d');
    const pad = t[LT.muzzle] * smooth((z - (plan.muzzle[2] / H - 0.065)) * 45);
    out.lerp(nose, pad * 0.92);
    out.lerp(darkCoat ? col('#3a2f2c') : col('#d9a296'), t[LT.udder] * 0.85);
    out.lerp(g.pattern === 'masked' || darkCoat ? second : col(mixHex(g.coat, '#2a1e18', 0.45)), t[LT.switch] * 0.8);
    if (sex === 'male') out.lerp(second, smooth((y - 0.8) * 5) * smooth((z - 0.45) * 6) * 0.2);
  } else {
    // A sheep: the fleece, and the bare face and legs (dark on a blackface, spotted on a Jacob).
    const bare = clamp((t[LT.face] + t[LT.lowleg] + t[LT.muzzle]) - t[LT.wool] * 0.6, 0, 1);
    const skin = g.pattern === 'masked' ? second : g.pattern === 'patched' ? col(mixHex(g.coat, g.secondary, valueNoise(x * 9 + seed, y * 9, z * 9) > 0.55 ? 0.85 : 0.05)) : col(mixHex(g.secondary, '#c9b9a2', 0.15));
    if (g.pattern === 'patched') {
      const n = fbm(x * 2.8 + seed, y * 2.8, z * 2.8);
      if (n > 0.58) out.copy(second);
    }
    out.lerp(skin, bare);
    out.lerp(col('#2a2321'), t[LT.muzzle] * smooth((z - (plan.muzzle[2] / H - 0.04)) * 40) * 0.8);
  }
  out.lerp(col('#2a221d'), t[LT.hoof]);
  if (pale && t[LT.hoof] > 0.3 && g.pattern !== 'masked') out.lerp(col('#6a5a48'), t[LT.hoof] * 0.5);
  // Fine variation, so no coat looks painted on; an old beast greys a little at the face.
  const v = 0.94 + valueNoise(x * 18 + seed, y * 18, z * 18) * 0.12;
  out.multiplyScalar(v);
  if (elder) out.lerp(col('#9a948c'), t[LT.face] * 0.15);
  return out;
}

/**
 * Wool: a fine relief of curls and locks in the shader (bumped normals from 3D noise in the body's
 * own space, so the curls ride with the sheep), darker down in the crevices, with a soft sheen on
 * the tips. Only where the fleece grows (`aWool`); the face and legs are plain hair.
 */
function woolMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWool;\nvarying float vWool;\nvarying vec3 vWoolP;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvWool = aWool;\nvWoolP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vWool;
varying vec3 vWoolP;
float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Curls: rounded bumps (ridged noise turned over), two sizes.
float woolH(vec3 p) {
  float a = 1.0 - abs(wNoise(p * 70.0) * 2.0 - 1.0);
  float b = 1.0 - abs(wNoise(p * 160.0 + 11.0) * 2.0 - 1.0);
  return a * 0.65 + b * 0.35;
}
vec3 woolPerturb(vec3 surfPos, vec3 n, vec2 dH, float fd) {
  vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - g);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float woolh = woolH(vWoolP);
diffuseColor.rgb *= mix(1.0, 0.7 + 0.42 * woolh, vWool);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = woolPerturb(-vViewPosition, normal, vec2(dFdx(woolh), dFdy(woolh)) * vWool * 1.6, faceDirection);`);
  };
  m.customProgramCacheKey = () => 'stock-wool-1';
  return m;
}

function mixHex(a: string, b: string, t: number): string {
  return '#' + col(a).lerp(col(b), t).getHexString();
}

/** A tapered tube along a curve (horns): radius from r0 to r1, with optional ridges. */
function taperedTube(points: THREE.Vector3[], r0: number, r1: number, ridges: number, colA: THREE.Color, colB: THREE.Color): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = 28, rad = 10;
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], nor: number[] = [], colr: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.8)) * (1 + (ridges ? 0.08 * Math.sin(t * ridges * Math.PI * 2) * (1 - t) : 0));
    c.copy(colA).lerp(colB, smooth((t - 0.45) * 1.8));
    for (let k = 0; k <= rad; k++) {
      const a = (k / rad) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      colr.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < rad; k++) {
    const a = i * (rad + 1) + k, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // Cap the tip.
  const tip = curve.getPointAt(1);
  const ti = pos.length / 3;
  pos.push(tip.x, tip.y, tip.z);
  const tn = curve.getTangentAt(1);
  nor.push(tn.x, tn.y, tn.z);
  colr.push(colB.r, colB.g, colB.b);
  for (let k = 0; k < rad; k++) idx.push(segs * (rad + 1) + k, ti, segs * (rad + 1) + k + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx);
  return geo;
}

interface Pose {
  /** How far the body drops (m), its pitch (+ nose down) and roll. */
  drop: number; pitch: number; roll: number;
  neck: number; neck2: number; head: number; yaw: number;
  jaw: number; chew: number; ears: number; tail: number;
  eyes: number;
  /** 0 standing … 1 lying with the legs folded. */
  lie: number;
}
const POSE_KEYS: (keyof Pose)[] = ['drop', 'pitch', 'roll', 'neck', 'neck2', 'head', 'yaw', 'jaw', 'chew', 'ears', 'tail', 'eyes', 'lie'];

export class LivestockAvatar {
  readonly root = new THREE.Group();
  readonly headAnchor = new THREE.Object3D();
  readonly plan: QuadPlan;
  private bones: THREE.Bone[] = [];
  private body!: THREE.SkinnedMesh;
  private cur: Pose;
  private moveW = 0;
  private runW = 0;
  private seed: number;
  private clock = 0;
  private blinkAt = 2;
  private blinkT = -1;
  private flickAt = 3;
  private flick = { side: 0, t: -1 };
  private swishAt = 2;
  private swish = { t: -1, dir: 1, dur: 1.2 };
  private ears: { pivot: THREE.Object3D; side: number }[] = [];
  private eyes: THREE.Object3D[] = [];
  private restDir: number[][] = [];
  /** Where each foot is held while standing still (root space z offset from neutral, m). */
  private feet: { z: number; y: number; stepT: number; from: number }[] = [];
  private lastDist = 0;
  private gaitDist = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookW = 0;
  /** Solved neck and head angles that put the muzzle at the grass, a trough or a manger. */
  private reach: Record<'graze' | 'drink' | 'eat' | 'lieGraze', [number, number, number, number]>;
  private fleece = 1;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();

  constructor(g: AnimalGenome, stage: AnimalStage, speciesId: 'cow' | 'sheep', sex: AnimalSex = 'female') {
    const plan = quadPlan(speciesId, g, stage, sex);
    this.plan = plan;
    const H = plan.H;
    const elder = stage === 'elder';
    this.seed = lookSeed(g);
    for (let i = 0; i < LBONES; i++) {
      const b = new THREE.Bone();
      b.name = `stock-bone-${i}`;
      this.bones.push(b);
    }
    plan.parents.forEach((p, i) => {
      const j = plan.joints[i];
      const pj = p >= 0 ? plan.joints[p] : [0, 0, 0];
      this.bones[i].position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      (p >= 0 ? this.bones[p] : this.root).add(this.bones[i]);
    });
    for (const leg of plan.legs) {
      const j = leg.joints;
      // Rest direction of each segment, as an angle from straight down (forward positive).
      this.restDir.push([0, 1, 2, 3].map((k) => Math.atan2(j[k + 1][2] - j[k][2], j[k][1] - j[k + 1][1])));
      this.feet.push({ z: 0, y: 0, stepT: -1, from: 0 });
    }

    const key = JSON.stringify([g, stage, speciesId, sex]);
    const geometry = cached(key, () => {
      const voxel = H / (speciesId === 'cow' ? 46 : 40);
      const s = sculpt(plan.masses, voxel, LT_COUNT, { weightSoft: voxel * 2.2 });
      diffuseWeights(meshNeighbours(s.indices, s.positions.length / 3), s.skinIndex, s.skinWeight, 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(s.skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(s.skinWeight, 4));
      geo.setIndex(new THREE.BufferAttribute(s.indices, 1));
      const n = s.positions.length / 3;
      const colors = new Float32Array(n * 3);
      const c = new THREE.Color();
      const tags = new Float32Array(LT_COUNT);
      for (let i = 0; i < n; i++) {
        for (let t = 0; t < LT_COUNT; t++) tags[t] = s.tagWeights[i * LT_COUNT + t];
        coatColour(plan, g, sex, elder, [s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2]], tags, c);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (plan.fleece > 0) {
        // The fleece: wool areas swell out along the normal into soft lumps (locks and staples);
        // the face, the lower legs and the hooves stay bare.
        const fp = new Float32Array(s.positions);
        // How much of a vertex rides on the head (the face is bare; the wool stops at the poll).
        const headW = (i: number) => {
          let w = 0;
          for (let k = 0; k < 4; k++) { const bone = s.skinIndex[i * 4 + k]; if (bone === LB.head || bone === LB.jaw) w += s.skinWeight[i * 4 + k]; }
          return w;
        };
        // The wool thins out up the neck to nothing behind the ears: no collar edge.
        const poll = plan.joints[LB.head];
        const woolOf = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = s.positions[i * 3], y = s.positions[i * 3 + 1], z = s.positions[i * 3 + 2];
          const fromPoll = Math.hypot(x - poll[0], y - poll[1], z - poll[2]) / H;
          const neck = smooth((fromPoll - 0.1) / 0.26) * (1 - smooth((headW(i) - 0.35) * 3));
          const wool = neck * clamp(s.tagWeights[i * LT_COUNT + LT.wool] * 1.4 - s.tagWeights[i * LT_COUNT + LT.face] * 0.9 - s.tagWeights[i * LT_COUNT + LT.lowleg] - s.tagWeights[i * LT_COUNT + LT.hoof], 0, 1);
          woolOf[i] = wool;
          // Staples and locks: broad rolls, then smaller curls breaking the outline.
          const lump = 0.66 + 0.4 * fbm(x / H * 9 + this.seed, y / H * 9, z / H * 9) + 0.22 * valueNoise(x / H * 19, y / H * 19 + 3, z / H * 19) + 0.12 * valueNoise(x / H * 38, y / H * 38, z / H * 38);
          // Less on the belly (it hangs in a thin fringe there).
          const under = 1 - smooth((plan.belly / H + 0.12 - y / H) * 5) * 0.5;
          const d = plan.fleece * wool * lump * under;
          fp[i * 3] += s.normals[i * 3] * d; fp[i * 3 + 1] += s.normals[i * 3 + 1] * d; fp[i * 3 + 2] += s.normals[i * 3 + 2] * d;
        }
        // Relax the swell a few rings over the surface: in hollows (where the neck meets the
        // shoulder) offsets along diverging normals would cross and fold into a dark crease.
        {
          const nb = meshNeighbours(s.indices, n);
          let off = new Float32Array(n * 3);
          for (let i = 0; i < n * 3; i++) off[i] = fp[i] - s.positions[i];
          for (let it = 0; it < 6; it++) {
            const next = new Float32Array(off);
            for (let i = 0; i < n; i++) {
              const list = nb[i];
              if (!list.length) continue;
              let ax = 0, ay = 0, az = 0;
              for (const j of list) { ax += off[j * 3]; ay += off[j * 3 + 1]; az += off[j * 3 + 2]; }
              const k = 0.5 / list.length;
              next[i * 3] = off[i * 3] * 0.5 + ax * k; next[i * 3 + 1] = off[i * 3 + 1] * 0.5 + ay * k; next[i * 3 + 2] = off[i * 3 + 2] * 0.5 + az * k;
            }
            off = next;
          }
          for (let i = 0; i < n * 3; i++) fp[i] = s.positions[i] + off[i];
        }
        const tmp = new THREE.BufferGeometry();
        tmp.setAttribute('position', new THREE.BufferAttribute(fp, 3));
        tmp.setIndex(new THREE.BufferAttribute(s.indices, 1));
        tmp.computeVertexNormals();
        const dn = new Float32Array(n * 3);
        const tn = tmp.getAttribute('normal');
        for (let i = 0; i < n * 3; i++) {
          fp[i] -= s.positions[i];
          dn[i] = (tn.array as Float32Array)[i] - s.normals[i];
        }
        geo.morphAttributes.position = [new THREE.BufferAttribute(fp, 3)];
        geo.morphAttributes.normal = [new THREE.BufferAttribute(dn, 3)];
        geo.morphTargetsRelative = true;
        geo.setAttribute('aWool', new THREE.BufferAttribute(woolOf, 1));
        // Deep in the fleece the wool is darker and creamier; the tips catch the light.
        for (let i = 0; i < n; i++) {
          const wool = s.tagWeights[i * LT_COUNT + LT.wool];
          const v = valueNoise(s.positions[i * 3] / H * 22, s.positions[i * 3 + 1] / H * 22, s.positions[i * 3 + 2] / H * 22);
          const k = 1 - wool * (0.1 - v * 0.14);
          colors[i * 3] *= k; colors[i * 3 + 1] *= k; colors[i * 3 + 2] *= k * 0.98;
        }
      }
      geo.computeBoundingSphere();
      return geo;
    });
    const coat = speciesId === 'sheep' ? shared('stock-wool', woolMaterial) : shared('stock-coat-cow', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }));
    const body = new THREE.SkinnedMesh(geometry, coat);
    body.name = 'stock-body';
    body.castShadow = true;
    body.frustumCulled = false;
    if (plan.fleece > 0) body.morphTargetInfluences = [1];
    this.body = body;
    this.root.add(body);
    this.root.updateMatrixWorld(true);
    body.bind(new THREE.Skeleton(this.bones));

    const head = this.bones[LB.head];
    const hp = plan.joints[LB.head];
    const local = (p: V3) => new THREE.Vector3(p[0] - hp[0], p[1] - hp[1], p[2] - hp[2]);
    this.headAnchor.position.copy(local(plan.muzzle)).multiplyScalar(0.6);
    head.add(this.headAnchor);

    // Eyes: dark and wet for a cow; amber with the long pupil of a grazer for a sheep.
    const eyeMat = speciesId === 'sheep'
      ? shared('stock-eye-sheep', () => new THREE.MeshStandardMaterial({ map: sheepEyeTexture(g.eye), roughness: 0.12 }))
      : shared('stock-eye-cow', () => new THREE.MeshStandardMaterial({ color: '#1b120d', roughness: 0.1 }));
    for (const e of plan.eyes) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(e.r, 14, 10), eyeMat);
      eye.position.copy(local(e.at));
      // The sphere's texture centre (u = 0.75 of its seam) faces out to the side.
      eye.rotation.y = e.at[0] > 0 ? Math.PI * 0.5 + 0.35 : -Math.PI * 0.5 - 0.35;
      eye.name = 'stock-eye';
      head.add(eye);
      this.eyes.push(eye);
    }

    // Ears: a leaf of the coat colour with a paler, pinker inside.
    const earColour = new THREE.Color();
    const tags = new Float32Array(LT_COUNT);
    tags[LT.ear] = 1;
    tags[LT.face] = 1;
    for (const e of plan.ears) {
      const side = Math.sign(e.at[0]);
      coatColour(plan, g, sex, elder, e.at, tags, earColour);
      if (g.pattern === 'patched' && valueNoise(this.seed + side * 3, 1, 2) > 0.5) earColour.set(g.secondary);
      const pivot = new THREE.Object3D();
      pivot.position.copy(local(e.at));
      const dir = new THREE.Vector3(...e.dir).normalize();
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      const outer = new THREE.Mesh(earGeometry(e.len, e.width, 1), shared(`stock-ear-${earColour.getHexString()}`, () => new THREE.MeshStandardMaterial({ color: earColour.clone(), roughness: 0.8, side: THREE.DoubleSide })));
      outer.castShadow = true;
      const inner = new THREE.Mesh(earGeometry(e.len * 0.82, e.width * 0.7, 0.5), shared(`stock-ear-in-${speciesId}`, () => new THREE.MeshStandardMaterial({ color: speciesId === 'cow' ? '#c4958a' : '#c9a296', roughness: 0.9 })));
      inner.position.set(e.len * 0.06, 0, e.width * 0.05);
      const ear = new THREE.Group();
      ear.add(outer, inner);
      pivot.add(ear);
      head.add(pivot);
      this.ears.push({ pivot: ear, side });
    }

    // Horns: a cow's sweep out and up; a ewe's small curve back; a ram's great spiral.
    if (plan.horns) {
      const h = plan.horns;
      const base = col(speciesId === 'cow' ? '#d9c9a8' : '#bba98a');
      const tip = col(speciesId === 'cow' ? (g.pattern === 'masked' ? '#1f1a17' : '#4a3d30') : '#6d5d48');
      for (const sd of [-1, 1]) {
        const o = local([h.at[0] * sd, h.at[1], h.at[2]]);
        const L = h.len;
        const pts: THREE.Vector3[] = [];
        if (speciesId === 'cow') {
          for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            pts.push(new THREE.Vector3(o.x + sd * L * (0.15 + t * 0.75), o.y + L * (0.05 + Math.pow(t, 1.6) * 0.6), o.z + L * (Math.sin(t * Math.PI) * 0.3 - t * 0.05)));
          }
        } else if (h.ram) {
          // A spiral round the ear: back, down and forward, widening outwards.
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const a = t * Math.PI * 1.6;
            const r = L * (0.42 - t * 0.16);
            pts.push(new THREE.Vector3(o.x + sd * L * (0.08 + t * 0.45), o.y + Math.sin(a) * r * 0.9, o.z - (1 - Math.cos(a)) * r * 0.55 + r * 0.05));
          }
        } else {
          for (let i = 0; i <= 5; i++) {
            const t = i / 5;
            pts.push(new THREE.Vector3(o.x + sd * L * (0.05 + t * 0.3), o.y + L * (0.15 + Math.sin(t * 2) * 0.25), o.z - L * t * 0.6));
          }
        }
        const r0 = speciesId === 'cow' ? H * 0.026 : H * (h.ram ? 0.04 : 0.022);
        const hornMat = shared('stock-horn', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
        const horn = new THREE.Mesh(taperedTube(pts, r0, r0 * 0.15, speciesId === 'cow' ? 0 : 9, base, tip), hornMat);
        horn.castShadow = true;
        horn.name = 'stock-horn';
        head.add(horn);
      }
    }

    this.cur = { drop: 0, pitch: 0, roll: 0, neck: 0, neck2: 0, head: 0, yaw: 0, jaw: 0, chew: 0, ears: 0, tail: 0, eyes: 1, lie: 0 };
    this.reach = {
      graze: this.solveReach(0.035 * H, 0, 1.05),
      drink: this.solveReach(0.42 * H, 0, 0.75),
      eat: this.solveReach(0.55 * H, 0, 0.7),
      lieGraze: this.solveReach(0.03 * H, this.lieDrop(), 0.9),
    };
    this.root.traverse((o) => { o.userData.animal = true; });
  }

  /** How far the body drops to lie with its belly on the ground. */
  private lieDrop(): number {
    // The fleece under the belly (about half its depth there) holds a sheep that much higher.
    return this.plan.belly - this.plan.H * 0.02 - this.plan.fleece * 0.62 * (this.body?.morphTargetInfluences?.[0] ?? 1);
  }

  /**
   * Neck, neck2 and head angles (and a little forward pitch of the body) that bring the muzzle to
   * the given height in front of the chest, the face turned down at about `face` radians.
   */
  private solveReach(height: number, drop: number, face: number): [number, number, number, number] {
    const j = this.plan.joints;
    const n0 = j[LB.neck], n1 = j[LB.neck2], n2 = j[LB.head], m = this.plan.muzzle;
    const rot = (p: number[], o: number[], a: number) => {
      const dy = p[1] - o[1], dz = p[2] - o[2];
      return [p[0], o[1] + dy * Math.cos(a) - dz * Math.sin(a), o[2] + dy * Math.sin(a) + dz * Math.cos(a)];
    };
    const muzzleAt = (a: number[]) => {
      // Body pitch about the hips, then each neck joint in turn.
      const hips = j[LB.hips];
      let pm = rot(m, hips, a[3]), p2 = rot(n2, hips, a[3]), p1 = rot(n1, hips, a[3]);
      const p0 = rot(n0, hips, a[3]);
      pm = rot(pm, p0, a[0]); p2 = rot(p2, p0, a[0]); p1 = rot(p1, p0, a[0]);
      pm = rot(pm, p1, a[1]); p2 = rot(p2, p1, a[1]);
      pm = rot(pm, p2, a[2]);
      return { y: pm[1] - drop, faceA: a[0] + a[1] + a[2] + a[3] };
    };
    const cost = (a: number[]) => {
      const r = muzzleAt(a);
      return Math.pow((r.y - height) / this.plan.H, 2) * 40 + Math.pow(r.faceA - face, 2) * 0.05 + (a[0] * a[0] + a[1] * a[1] * 1.5 + a[2] * a[2] * 2 + a[3] * a[3] * 6) * 0.004;
    };
    let best = [0.6, 0.2, 0.1, 0.05];
    let bc = cost(best);
    for (let step = 0.3; step > 0.002; step *= 0.6) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
          const t = best.slice();
          t[k] = clamp(t[k] + s * step, k === 3 ? -0.05 : -0.6, k === 3 ? 0.18 : 1.6);
          const c = cost(t);
          if (c < bc) { bc = c; best = t; improved = true; }
        }
      }
    }
    return best as [number, number, number, number];
  }

  /** A sheep's fleece grows back after shearing: 0 just shorn … 100 a full year's wool. */
  setProduce(p: number): void {
    if (this.plan.fleece <= 0) return;
    const want = 0.12 + 0.88 * clamp(p / 100, 0, 1);
    this.fleece = damp(this.fleece, want, 3, 1 / 30);
    this.body.morphTargetInfluences![0] = this.fleece;
  }

  lookAt(p: THREE.Vector3 | null): void {
    this.lookTarget = p ? (this.lookTarget ?? new THREE.Vector3()).copy(p) : null;
  }

  animate(activity: AnimalActivity, moving: boolean, running: boolean, time: number, dt: number, distanceWalked = 0, _traits: readonly string[] = []): void {
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    const H = this.plan.H;
    const cow = this.plan.species === 'cow';
    const t = time + this.seed;
    this.moveW = damp(this.moveW, moving ? 1 : 0, 6, dt);
    this.runW = damp(this.runW, moving && running ? 1 : 0, 5, dt);
    const lying = !moving && (activity === 'lie' || activity === 'sleep' || activity === 'roll');
    const grazing = !moving && activity === 'graze';

    // --- the pose this activity wants -------------------------------------------------------
    const tg: Pose = { drop: 0, pitch: 0, roll: 0, neck: 0, neck2: 0, head: 0, yaw: 0, jaw: 0, chew: 0, ears: 0, tail: 0, eyes: 1, lie: 0 };
    const reach = (r: [number, number, number, number]) => { tg.neck = r[0]; tg.neck2 = r[1]; tg.head = r[2]; tg.pitch = r[3]; };
    if (lying) {
      tg.lie = 1;
      tg.drop = this.lieDrop();
      tg.roll = 0.13 * (this.seed % 2 > 1 ? 1 : -1);
      if (activity === 'sleep') {
        // Asleep: neck stretched out, chin down on the grass, eyes shut.
        reach(this.reach.lieGraze);
        tg.pitch = 0;
        tg.neck *= 0.9;
        tg.eyes = 0;
        tg.ears = 0.6;
      } else {
        // Lying up and chewing the cud: head high, slow sideways grinding, eyes half shut.
        tg.neck = -0.12;
        tg.head = 0.12;
        tg.chew = 1;
        tg.eyes = 0.55;
        tg.ears = 0.25;
      }
    } else if (grazing) {
      reach(this.reach.graze);
      // Tearing at the grass: a tug of the head and a few chews, over and over.
      const bite = Math.max(0, Math.sin(t * 3.1)) ** 3;
      tg.head += bite * 0.1;
      tg.jaw = bite * 0.12;
      tg.chew = 0.4;
    } else if (activity === 'drink' && !moving) {
      reach(this.reach.drink);
      tg.jaw = 0.04 + Math.max(0, Math.sin(t * 5)) * 0.04;
    } else if (activity === 'eat' && !moving) {
      reach(this.reach.eat);
      tg.chew = 1;
    } else {
      // Standing: head carried a little low, now and then chewing, now and then looking about.
      tg.neck = 0.08 + Math.sin(t * 0.21) * 0.06;
      tg.head = 0.05;
      tg.chew = !moving && Math.sin(t * 0.13) > 0.2 ? 0.7 : 0;
      // Walking: the head nods with each step.
      tg.neck += this.moveW * 0.12 * (1 - this.runW);
    }
    if (moving && !lying) tg.tail = this.runW * 0.5;

    // Blinks; eyes close for sleep.
    if (this.clock > this.blinkAt) { this.blinkT = 0; this.blinkAt = this.clock + 2.5 + valueNoise(this.clock, this.seed, 0) * 5; }
    let blink = 1;
    if (this.blinkT >= 0) { this.blinkT += dt; blink = Math.abs(this.blinkT - 0.09) / 0.09; if (this.blinkT > 0.18) this.blinkT = -1; }

    // Spring every pose value toward its target (slow for the body, quicker for the head).
    for (const k of POSE_KEYS) {
      const rate = k === 'lie' || k === 'drop' ? 2.2 : k === 'eyes' ? 6 : k === 'jaw' ? 14 : 4.5;
      this.cur[k] = damp(this.cur[k], tg[k], rate, dt);
    }
    const p = this.cur;

    // Looking at someone: the head (and a little the neck) turns that way.
    let lookYaw = 0;
    if (this.lookTarget && !lying && activity !== 'sleep' && !grazing) {
      this.root.updateMatrixWorld(true);
      const local = this.root.worldToLocal(this.tmpV.copy(this.lookTarget));
      const neck = this.plan.joints[LB.neck];
      lookYaw = clamp(Math.atan2(local.x - neck[0], local.z - neck[2]), -1.2, 1.2);
    }
    this.lookW = damp(this.lookW, this.lookTarget && !lying && !grazing ? 1 : 0, 2.5, dt);
    this.lookYaw = damp(this.lookYaw, lookYaw, 3, dt);

    // --- the body ----------------------------------------------------------------------------
    const b = this.bones;
    const j = this.plan.joints;
    // Gait: the body rises and falls twice a stride at the walk, and rocks a little.
    const stepD = Math.max(0, distanceWalked - this.lastDist);
    this.lastDist = distanceWalked;
    if (stepD < 2) this.gaitDist += stepD;
    const C = H * (cow ? 1.15 : 1.3) * (1 + this.runW * 0.6);
    const phase = this.gaitDist / C;
    const bob = this.moveW * (Math.abs(Math.sin(phase * Math.PI * 2)) - 0.5) * H * (0.012 + this.runW * 0.03);
    const rock = this.moveW * Math.sin(phase * Math.PI * 2) * 0.025 * (1 - this.runW);
    b[LB.hips].position.set(j[LB.hips][0], j[LB.hips][1] - p.drop + bob, j[LB.hips][2]);
    b[LB.hips].rotation.set(p.pitch, 0, p.roll + rock);
    b[LB.spine].rotation.set(0, 0, 0);
    b[LB.chest].rotation.set(0, 0, 0);
    // Lying, the udder is pressed up and aside into the belly.
    b[LUDDER].position.set(j[LUDDER][0] - j[LB.hips][0] + p.lie * p.roll * 0.4 * H, j[LUDDER][1] - j[LB.hips][1] + p.lie * 0.08 * H, j[LUDDER][2] - j[LB.hips][2]);
    b[LUDDER].scale.set(1 + p.lie * 0.15, 1 - p.lie * 0.45, 1);
    // Breathing: the barrel swells slowly.
    const breath = 1 + Math.sin(this.clock * (lying ? 1.4 : 1.9)) * 0.012;
    b[LB.spine].scale.set(breath, breath, 1);
    // Neck and head: the solved reach, the nod of the walk and the turn to look.
    const nod = this.moveW * Math.sin(phase * Math.PI * 4) * 0.05 * (1 - this.runW);
    b[LB.neck].rotation.set(p.neck + nod, this.lookYaw * this.lookW * 0.35, 0);
    b[LB.neck2].rotation.set(p.neck2, this.lookYaw * this.lookW * 0.25, 0);
    b[LB.head].rotation.set(p.head - nod * 0.6, this.lookYaw * this.lookW * 0.4, Math.sin(t * 0.37) * 0.03);
    // Chewing: a cow's jaw grinds round and sideways, steady as a mill.
    const chewT = this.clock * (cow ? 7.2 : 8.4);
    b[LB.jaw].rotation.set(p.jaw + p.chew * (0.035 + Math.sin(chewT) * 0.035), p.chew * Math.sin(chewT + 1.2) * 0.07, 0);

    // Tail: hangs, swishes at flies now and then, lifts a little at the trot.
    if (this.clock > this.swishAt && this.swish.t < 0) {
      this.swish = { t: 0, dir: valueNoise(this.clock, 3, this.seed) > 0.5 ? 1 : -1, dur: 0.9 + valueNoise(this.clock, 5, 1) * 0.8 };
      this.swishAt = this.clock + 2 + valueNoise(this.clock, this.seed, 9) * (lying ? 9 : 5);
    }
    let sw = 0;
    if (this.swish.t >= 0) {
      this.swish.t += dt;
      const u = this.swish.t / this.swish.dur;
      sw = Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI) * this.swish.dir;
      if (u >= 1) this.swish.t = -1;
    }
    const tailSway = Math.sin(this.clock * 1.3 + this.seed) * 0.04 + this.moveW * Math.sin(phase * Math.PI * 2) * 0.08;
    for (let i = 0; i < LTAIL; i++) {
      const tb = b[LB.tail + i];
      // Lying, the tail is swung back off the ground behind it.
      const laid = p.lie * [0.1, 0.65, 0.72][i];
      tb.rotation.set((i === 0 ? -p.tail : 0) + laid, 0, (sw * (cow ? 0.55 : 0.3) + tailSway) * (i === 0 ? 1 : 0.6));
    }

    // Ears: carried out to the side, flicked at flies, laid back when asleep.
    if (this.clock > this.flickAt && this.flick.t < 0) {
      this.flick = { side: valueNoise(this.clock, 1, this.seed) > 0.5 ? 1 : -1, t: 0 };
      this.flickAt = this.clock + 1.5 + valueNoise(this.clock, 2, this.seed) * 6;
    }
    let fl = 0;
    if (this.flick.t >= 0) {
      this.flick.t += dt;
      fl = Math.sin(clamp(this.flick.t / 0.35, 0, 1) * Math.PI);
      if (this.flick.t > 0.35) this.flick.t = -1;
    }
    for (const e of this.ears) {
      const f = e.side === this.flick.side ? fl : 0;
      // Turned toward someone it's watching.
      const turn = this.lookW * this.lookYaw * e.side * 0.3;
      e.pivot.rotation.set(0, -p.ears * 0.6 * e.side + turn - f * 0.5 * e.side, (-p.ears * 0.35 + f * 0.4) * e.side);
    }
    // Eyes: a blink scales the eyeball into its lids (the socket is the lid, coat-coloured).
    const open = Math.max(0.08, Math.min(p.eyes, blink));
    for (const e of this.eyes) e.scale.set(1, open, 1);

    // --- the legs ----------------------------------------------------------------------------
    this.root.updateMatrixWorld(true);
    const rootInv = this.tmpM.copy(this.root.matrixWorld).invert();
    const duty = THREE.MathUtils.lerp(0.64, 0.4, this.runW);
    const sweep = C * duty;
    // Lateral four-beat walk: hind left, fore left, hind right, fore right; the trot on diagonals.
    const walkOff = [0.25, 0.75, 0, 0.5];
    const trotOff = [0, 0.5, 0.5, 0];
    for (let l = 0; l < 4; l++) {
      const leg = this.plan.legs[l];
      const lj = leg.joints;
      const fore = leg.fore;
      const off = THREE.MathUtils.lerp(walkOff[l], trotOff[l], this.runW);
      const ph = (((phase + off) % 1) + 1) % 1;
      let fz = 0, fy = 0, swing = 0;
      if (ph < duty) fz = sweep * (0.5 - ph / duty);
      else {
        const u = (ph - duty) / (1 - duty);
        fz = sweep * (-0.5 + smooth(u));
        swing = Math.sin(u * Math.PI);
        fy = swing * H * (0.07 + this.runW * 0.05);
      }
      // Coming to a halt, each foot is set down where it was and then squared up in turn.
      const ft = this.feet[l];
      if (this.moveW > 0.5) { ft.z = fz; ft.y = fy; ft.stepT = -1; }
      else {
        if (ft.stepT < 0 && Math.abs(ft.z) > H * 0.02 && this.feet.every((o) => o.stepT < 0) && (l === 0 || Math.abs(this.feet[l - 1].z) <= H * 0.02)) { ft.stepT = 0; ft.from = ft.z; }
        if (ft.stepT >= 0) {
          ft.stepT += dt / 0.32;
          const u = Math.min(1, ft.stepT);
          ft.z = ft.from * (1 - smooth(u));
          ft.y = Math.sin(u * Math.PI) * H * 0.05;
          if (u >= 1) { ft.stepT = -1; ft.y = 0; }
        } else ft.y = damp(ft.y, 0, 10, dt);
        swing = ft.y / (H * 0.07);
      }
      const footZ = lj[4][2] + (this.moveW > 0.5 ? fz : ft.z);
      const footY = this.moveW > 0.5 ? fy : ft.y;
      // Where the shoulder or hip joint is now, in root space.
      const top = b[lleg(l, 0)].getWorldPosition(this.tmpV).applyMatrix4(rootInv);
      // Pastern and cannon: the fetlock sinks under weight; the knee or hock folds in the swing.
      const restPast = this.restDir[l][3], restCan = this.restDir[l][2];
      const past = restPast + swing * (fore ? -0.9 : -0.7);
      const can = restCan + swing * (fore ? -0.7 : 0.25);
      const lp = dist3(lj[3], lj[4]), lc = dist3(lj[2], lj[3]);
      const Fy = footY + lp * Math.cos(past), Fz = footZ - lp * Math.sin(past);
      const Ky = Fy + lc * Math.cos(can), Kz = Fz - lc * Math.sin(can);
      const l0 = dist3(lj[0], lj[1]), l1 = dist3(lj[1], lj[2]);
      const standA = ik2(top.y, top.z, Ky, Kz, l0, l1, fore ? -1 : 1);
      const stand = [standA[0], standA[1], Math.atan2(Fz - Kz, Ky - Fy), Math.atan2(footZ - Fz, Fy - footY)];
      // Lying: the fore legs folded under at the knee, the hind legs tucked forward under the belly.
      const fold = fore ? [-0.78, Math.PI * 0.5 - 0.1, -Math.PI * 0.5 - 0.1, -Math.PI * 0.5 + 0.25] : [Math.PI * 0.42, -Math.PI * 0.5 - 0.2, Math.PI * 0.52, Math.PI * 0.55];
      const pitchParent = p.pitch;
      let acc = pitchParent;
      for (let k = 0; k < 4; k++) {
        const ang = THREE.MathUtils.lerp(stand[k], fold[k], smooth(p.lie));
        const world = -(ang - this.restDir[l][k]);
        b[lleg(l, k)].rotation.set(world - acc, 0, k === 0 ? (p.lie * (l % 2 === 0 ? 1 : -1) * (fore ? 0.05 : 0.22) * (Math.sign(p.roll) === (l % 2 === 0 ? 1 : -1) ? 1.6 : 0.6)) : 0);
        acc = world;
      }
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !geoCacheHas(m.geometry)) m.geometry.dispose();
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    });
  }
}

function geoCacheHas(g: THREE.BufferGeometry): boolean {
  for (const v of geoCache.values()) if (v === g) return true;
  return false;
}

function dist3(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Two-bone IK in the side plane: angles (from straight down, forward positive) of the upper and
 * lower segments reaching from (y0, z0) to (y1, z1). `bend` −1 puts the middle joint behind the
 * line (an elbow), +1 in front of it (a stifle).
 */
function ik2(y0: number, z0: number, y1: number, z1: number, l0: number, l1: number, bend: number): [number, number] {
  const dy = y0 - y1, dz = z1 - z0;
  const d = clamp(Math.hypot(dy, dz), Math.abs(l0 - l1) + 1e-4, l0 + l1 - 1e-4);
  const base = Math.atan2(dz, dy);
  const a = Math.acos(clamp((l0 * l0 + d * d - l1 * l1) / (2 * l0 * d), -1, 1));
  const up = base + bend * a;
  const my = y0 - l0 * Math.cos(up), mz = z0 + l0 * Math.sin(up);
  return [up, Math.atan2(z1 - mz, my - y1)];
}

/** An ear: a soft leaf along +X, cupped a little. */
function earGeometry(len: number, width: number, cup: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 14, 8);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // Leaf: widest a third of the way out, pointed at the tip; thin, with the inside hollowed.
    const u = (x + 1) / 2;
    const w = Math.sin(Math.PI * Math.pow(u, 0.75)) * width * 0.5;
    // Broad face upright, the hollow opening forward.
    p.setXYZ(i, u * len, y * w, z * w * 0.25 - Math.abs(y) * w * 0.15 * cup);
  }
  g.computeVertexNormals();
  return g;
}

/** A sheep's eye: amber, with the long sideways pupil of a grazing animal. */
const eyeTextures = new Map<string, THREE.DataTexture>();
function sheepEyeTexture(iris: string): THREE.DataTexture {
  const hit = eyeTextures.get(iris);
  if (hit) return hit;
  const W = 32, Hh = 16;
  const data = new Uint8Array(W * Hh * 4);
  const ir = col('#b8862e').lerp(col(iris), 0.3);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    // u = 0.75 of the sphere's seam faces out (see the eye's rotation): the pupil is centred there.
    const u = x / W, v = y / Hh;
    const du = Math.min(Math.abs(u - 0.75), 1 - Math.abs(u - 0.75)) * 4, dv = (v - 0.5) * 2;
    const r = Math.hypot(du, dv);
    const pupil = Math.abs(dv) < 0.17 && du < 0.55;
    const c = pupil ? col('#0d0b0a') : r < 0.95 ? ir.clone().multiplyScalar(0.75 + 0.35 * (1 - r)) : col('#2d241c');
    const k = (y * W + x) * 4;
    data[k] = c.r * 255; data[k + 1] = c.g * 255; data[k + 2] = c.b * 255; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, Hh);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  eyeTextures.set(iris, tex);
  return tex;
}
