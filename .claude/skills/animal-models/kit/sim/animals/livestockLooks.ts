import type { Rng } from '../../core/Rng.ts';
import type { AnimalGenome, AnimalSex } from './Animal.ts';

/**
 * Farm stock looks (§ farm animals): the old landrace breeds of the English and Welsh countryside,
 * before the improvers. Medieval cattle were small (a cow stood little over a metre at the
 * shoulder), sheep were kept for their wool first, and every cottage had a few hens.
 *
 * A breed fixes the colours and the horns; size and build vary a little from beast to beast.
 * `pattern` reads per species: on a cow 'patched' is pied and 'masked' is white with dark points
 * (ears, muzzle, feet); on a sheep 'masked' is a dark face and legs under a pale fleece and
 * 'patched' is spotted (piebald); on a hen 'spotted' is speckled and 'ticked' is barred.
 */
export interface LivestockBreed {
  id: string;
  label: string;
  species: 'cow' | 'sheep' | 'chicken';
  coat: string;
  secondary: string;
  pattern: AnimalGenome['pattern'];
  /** Horn length for the females; males carry a little more. */
  horns: number;
  /** Fleece or feather fullness, 0 … 1. */
  coatLength: number;
  eye: string;
  blurb: string;
}

export const LIVESTOCK_BREEDS: LivestockBreed[] = [
  { id: 'red', label: 'Red Cow', species: 'cow', coat: '#8c3f20', secondary: '#5f2a15', pattern: 'solid', horns: 0.55, coatLength: 0.2, eye: '#2a1a12', blurb: 'Deep red and hardy: the cottager\'s cow of the West Country.' },
  { id: 'black', label: 'Black Cow', species: 'cow', coat: '#201b19', secondary: '#120f0e', pattern: 'solid', horns: 0.7, coatLength: 0.3, eye: '#24170f', blurb: 'Black as a crow, from the Welsh hills: milk, beef and a long life.' },
  { id: 'dun', label: 'Dun Cow', species: 'cow', coat: '#a88762', secondary: '#6d533a', pattern: 'solid', horns: 0.5, coatLength: 0.25, eye: '#2a1a12', blurb: 'Mouse-brown and gentle, like the Dun Cow of the old tale.' },
  { id: 'pied', label: 'Pied Cow', species: 'cow', coat: '#efe9dd', secondary: '#211d1b', pattern: 'patched', horns: 0.45, coatLength: 0.2, eye: '#24170f', blurb: 'Black and white in patches no two alike: a good milker.' },
  { id: 'white_park', label: 'White Cow', species: 'cow', coat: '#ece6d9', secondary: '#1d1a19', pattern: 'masked', horns: 0.95, coatLength: 0.25, eye: '#20140e', blurb: 'White with black ears and muzzle, and great sweeping horns: an ancient kind.' },
  { id: 'white', label: 'White-faced Ewe', species: 'sheep', coat: '#e9e1cf', secondary: '#e3d6c3', pattern: 'solid', horns: 0, coatLength: 0.8, eye: '#3a2c16', blurb: 'A longwool of the wolds: the fleece that built the churches.' },
  { id: 'blackface', label: 'Blackface Ewe', species: 'sheep', coat: '#ddd3bf', secondary: '#221d1a', pattern: 'masked', horns: 0.55, coatLength: 0.7, eye: '#4a3614', blurb: 'Black-faced and horned, tough enough for any hillside.' },
  { id: 'moorit', label: 'Moorit Ewe', species: 'sheep', coat: '#7b5638', secondary: '#5e3f28', pattern: 'solid', horns: 0.45, coatLength: 0.55, eye: '#4a3614', blurb: 'Small and brown as a moor in autumn; the wool needs no dye.' },
  { id: 'spotted', label: 'Spotted Ewe', species: 'sheep', coat: '#ece4d4', secondary: '#3a2c24', pattern: 'patched', horns: 0.6, coatLength: 0.65, eye: '#3a2c16', blurb: 'Piebald, brown on white, like Jacob\'s flock.' },
  { id: 'black_sheep', label: 'Black Ewe', species: 'sheep', coat: '#2e2823', secondary: '#221d1a', pattern: 'solid', horns: 0, coatLength: 0.7, eye: '#3a2c16', blurb: 'Every flock has one.' },
  { id: 'speckled', label: 'Speckled Hen', species: 'chicken', coat: '#5b3a22', secondary: '#efe6d6', pattern: 'spotted', horns: 0, coatLength: 0.6, eye: '#c06a1c', blurb: 'Mahogany flecked with white: a steady layer.' },
  { id: 'red_hen', label: 'Red Hen', species: 'chicken', coat: '#9a4f22', secondary: '#5d2b14', pattern: 'solid', horns: 0, coatLength: 0.55, eye: '#c06a1c', blurb: 'Brown as a nut, and never off the lay for long.' },
  { id: 'white_hen', label: 'White Hen', species: 'chicken', coat: '#f1ede4', secondary: '#e2dccf', pattern: 'solid', horns: 0, coatLength: 0.55, eye: '#c0601a', blurb: 'White as a goose, and as bossy.' },
  { id: 'black_hen', label: 'Black Hen', species: 'chicken', coat: '#1b1b20', secondary: '#25332c', pattern: 'solid', horns: 0, coatLength: 0.55, eye: '#a8501a', blurb: 'Black with a green shine in the sun.' },
  { id: 'cuckoo', label: 'Cuckoo Hen', species: 'chicken', coat: '#7c7a78', secondary: '#dcd8d1', pattern: 'ticked', horns: 0, coatLength: 0.6, eye: '#c06a1c', blurb: 'Barred grey and white, like a cuckoo\'s breast.' },
];

export const LIVESTOCK_BREED: ReadonlyMap<string, LivestockBreed> = new Map(LIVESTOCK_BREEDS.map((b) => [b.id, b]));

export function breedsOf(speciesId: string): LivestockBreed[] {
  return LIVESTOCK_BREEDS.filter((b) => b.species === speciesId);
}

/** A beast of this breed (or any breed of the species). */
export function livestockGenome(rng: Rng, speciesId: 'cow' | 'sheep' | 'chicken', breedId?: string, sex: AnimalSex = 'female'): AnimalGenome {
  const pool = breedsOf(speciesId);
  const b = (breedId && LIVESTOCK_BREED.get(breedId)) || rng.pick(pool);
  const male = sex === 'male';
  return {
    size: Math.min(1, Math.max(0, rng.range(0.3, 0.7) + (male ? 0.2 : 0))),
    build: Math.min(1, Math.max(0, rng.range(0.3, 0.7) + (male ? 0.2 : 0))),
    coat: b.coat,
    secondary: b.secondary,
    pattern: b.pattern,
    coatLength: b.coatLength,
    ears: 'floppy',
    tail: speciesId === 'chicken' ? 'plumed' : 'long',
    muzzle: rng.range(0.4, 0.6),
    eye: b.eye,
    type: b.id,
    horns: b.horns > 0 ? Math.min(1, b.horns * (male ? 1.35 : 1) * rng.range(0.85, 1.1)) : 0,
  };
}

/** "red cow", "blackface ram", "speckled hen". */
export function livestockDescription(g: AnimalGenome, speciesId: string, sex: AnimalSex): string {
  const b = LIVESTOCK_BREED.get(String(g.type ?? ''));
  const label = (b?.label ?? speciesId).toLowerCase();
  if (sex !== 'male') return label;
  const word = speciesId === 'cow' ? 'bull' : speciesId === 'sheep' ? 'ram' : 'cockerel';
  return label.replace(/\b(cow|ewe|hen)\b/, word);
}

const NAMES: Record<string, Record<AnimalSex, string[]>> = {
  cow: {
    female: ['Daisy', 'Bluebell', 'Clover', 'Primrose', 'Buttercup', 'Moll', 'Hazel', 'Bramble', 'Blossom', 'Cowslip', 'Marigold', 'Brindle', 'Sorrel', 'Hawthorn'],
    male: ['Brutus', 'Old Tom', 'Bramwell', 'Thunder', 'Ox', 'Barnaby'],
  },
  sheep: {
    female: ['Tib', 'Nan', 'Bess', 'Snowdrop', 'Dulcie', 'Maud', 'Sukey', 'Mopsy', 'Wenna', 'Fleecy', 'Lambkin', 'Moppet', 'Cicely', 'Tansy'],
    male: ['Wat', 'Tup', 'Hob', 'Lambert', 'Curly', 'Jacob'],
  },
  chicken: {
    female: ['Partlet', 'Speckle', 'Goldie', 'Henny', 'Dot', 'Pip', 'Agnes', 'Peg', 'Bonnie', 'Clucky', 'Ginger', 'Matilda', 'Pecky', 'Hetty'],
    male: ['Chanticleer', 'Rufus', 'Sir Strut', 'Crowley', 'Reynard-Bane'],
  },
};

export function livestockName(rng: Rng, speciesId: string, sex: AnimalSex, avoid: Iterable<string> = []): string {
  const taken = new Set(avoid);
  const all = NAMES[speciesId]?.[sex] ?? NAMES.cow.female;
  const pool = all.filter((n) => !taken.has(n));
  return rng.pick(pool.length ? pool : all);
}

/** What a beast has ready to give, in words, for the Journal: "Milk: <b>udder half full</b>". */
export function livestockYield(a: { speciesId: string; sex: AnimalSex; stage: string; produce: number }): string {
  if (a.stage === 'young') return `Too young to give anything yet`;
  const p = a.produce;
  if (a.speciesId === 'cow') {
    if (a.sex === 'male') return 'Gives no milk (but sires the calves)';
    return `Milk: <b>${p >= 90 ? 'udder full: milk her now' : p >= 60 ? 'udder well filled' : p >= 30 ? 'udder half full' : 'just milked'}</b>`;
  }
  if (a.speciesId === 'sheep') return `Fleece: <b>${p >= 80 ? 'full: ready to shear' : `${Math.round(p)}% grown`}</b>`;
  if (a.sex === 'male') return 'Crows at dawn and keeps the hens in order';
  const eggs = Math.floor(p);
  return `Eggs waiting: <b>${eggs ? eggs : 'none just now'}</b>`;
}
