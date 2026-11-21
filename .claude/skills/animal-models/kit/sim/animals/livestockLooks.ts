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
  species: 'cow' | 'sheep' | 'goat' | 'pig' | 'chicken' | 'goose';
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
  { id: 'white_goat', label: 'White Nanny Goat', species: 'goat', coat: '#ece6d8', secondary: '#d8ccb8', pattern: 'solid', horns: 0.5, coatLength: 0.3, eye: '#8a6a22', blurb: 'Snow-white and placid: the best milker of them all.' },
  { id: 'chamois_goat', label: 'Chamois Nanny Goat', species: 'goat', coat: '#9a6a3c', secondary: '#231a14', pattern: 'masked', horns: 0.7, coatLength: 0.35, eye: '#9a7a22', blurb: 'Tawny brown with a black stripe down her back and black stockings: a hill goat.' },
  { id: 'black_goat', label: 'Black Nanny Goat', species: 'goat', coat: '#262120', secondary: '#1a1614', pattern: 'solid', horns: 0.75, coatLength: 0.5, eye: '#a08024', blurb: 'Shaggy and black as a witch\'s cat, and twice as clever.' },
  { id: 'pied_goat', label: 'Pied Nanny Goat', species: 'goat', coat: '#ebe4d6', secondary: '#4a3324', pattern: 'patched', horns: 0.6, coatLength: 0.35, eye: '#8a6a22', blurb: 'White, splashed with brown: every one is marked differently.' },
  { id: 'pink_pig', label: 'Pink Sow', species: 'pig', coat: '#e7b7a2', secondary: '#d39a86', pattern: 'solid', horns: 0, coatLength: 0.2, eye: '#2a1a12', blurb: 'Pale pink under fine white bristles, and fond of a wallow.' },
  { id: 'saddleback_pig', label: 'Saddleback Sow', species: 'pig', coat: '#2a2422', secondary: '#ede4d8', pattern: 'masked', horns: 0, coatLength: 0.3, eye: '#2a1a12', blurb: 'Black, with a white belt over her shoulders and down her forelegs.' },
  { id: 'spotted_pig', label: 'Spotted Sow', species: 'pig', coat: '#e9c3b0', secondary: '#2c2423', pattern: 'patched', horns: 0, coatLength: 0.25, eye: '#2a1a12', blurb: 'Pink with black spots: an orchard pig, fattened on windfalls.' },
  { id: 'ginger_pig', label: 'Ginger Sow', species: 'pig', coat: '#b4663a', secondary: '#8a4a28', pattern: 'solid', horns: 0, coatLength: 0.45, eye: '#2a1a12', blurb: 'Long-legged, bristly and ginger: an old woodland pig.' },
  { id: 'black_sheep', label: 'Black Ewe', species: 'sheep', coat: '#2e2823', secondary: '#221d1a', pattern: 'solid', horns: 0, coatLength: 0.7, eye: '#3a2c16', blurb: 'Every flock has one.' },
  { id: 'speckled', label: 'Speckled Hen', species: 'chicken', coat: '#5b3a22', secondary: '#efe6d6', pattern: 'spotted', horns: 0, coatLength: 0.6, eye: '#c06a1c', blurb: 'Mahogany flecked with white: a steady layer.' },
  { id: 'red_hen', label: 'Red Hen', species: 'chicken', coat: '#9a4f22', secondary: '#5d2b14', pattern: 'solid', horns: 0, coatLength: 0.55, eye: '#c06a1c', blurb: 'Brown as a nut, and never off the lay for long.' },
  { id: 'white_hen', label: 'White Hen', species: 'chicken', coat: '#f1ede4', secondary: '#e2dccf', pattern: 'solid', horns: 0, coatLength: 0.55, eye: '#c0601a', blurb: 'White as a goose, and as bossy.' },
  { id: 'black_hen', label: 'Black Hen', species: 'chicken', coat: '#1b1b20', secondary: '#25332c', pattern: 'solid', horns: 0, coatLength: 0.55, eye: '#a8501a', blurb: 'Black with a green shine in the sun.' },
  { id: 'white_goose', label: 'White Goose', species: 'goose', coat: '#f3f0e8', secondary: '#e4ded2', pattern: 'solid', horns: 0, coatLength: 0.6, eye: '#2a2a32', blurb: 'Snow-white and loud about it.' },
  { id: 'grey_goose', label: 'Greylag Goose', species: 'goose', coat: '#7d7568', secondary: '#d9d3c8', pattern: 'ticked', horns: 0, coatLength: 0.6, eye: '#2b1d14', blurb: 'Grey-brown with pale barred wings: the wild goose, tamed.' },
  { id: 'saddleback_goose', label: 'Saddleback Goose', species: 'goose', coat: '#f1eee6', secondary: '#6f6a62', pattern: 'masked', horns: 0, coatLength: 0.6, eye: '#2a2a32', blurb: 'White, with a grey head and a grey saddle over the back.' },
  { id: 'cuckoo', label: 'Cuckoo Hen', species: 'chicken', coat: '#7c7a78', secondary: '#dcd8d1', pattern: 'ticked', horns: 0, coatLength: 0.6, eye: '#c06a1c', blurb: 'Barred grey and white, like a cuckoo\'s breast.' },
];

export const LIVESTOCK_BREED: ReadonlyMap<string, LivestockBreed> = new Map(LIVESTOCK_BREEDS.map((b) => [b.id, b]));

export function breedsOf(speciesId: string): LivestockBreed[] {
  return LIVESTOCK_BREEDS.filter((b) => b.species === speciesId);
}

/** A beast of this breed (or any breed of the species). */
export function livestockGenome(rng: Rng, speciesId: 'cow' | 'sheep' | 'goat' | 'pig' | 'chicken' | 'goose', breedId?: string, sex: AnimalSex = 'female'): AnimalGenome {
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
  const word = speciesId === 'cow' ? 'bull' : speciesId === 'sheep' ? 'ram' : speciesId === 'goat' ? 'billy' : speciesId === 'pig' ? 'boar' : 'cockerel';
  return label.replace(/\b(cow|ewe|hen|nanny|sow)\b/, word);
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
  pig: {
    female: ['Truffle', 'Acorn', 'Peony', 'Rosie', 'Mudlark', 'Bella', 'Grunty', 'Pansy', 'Dumpling', 'Pickle', 'Hilda', 'Petunia', 'Bramble', 'Mabel'],
    male: ['Hamlet', 'Old Boar', 'Bacon', 'Gruntle', 'Sir Snout', 'Pudding'],
  },
  goat: {
    female: ['Nettle', 'Gwen', 'Hazel', 'Snowy', 'Nanny Peg', 'Juniper', 'Briony', 'Mab', 'Tilly', 'Thistle', 'Clem', 'Bramble', 'Elsie', 'Rue'],
    male: ['Billy', 'Old Nick', 'Gruff', 'Horace', 'Butt', 'Bartholomew'],
  },
  goose: {
    female: ['Gertrude', 'Honoria', 'Maud', 'Dame Wimple', 'Blanche', 'Edith', 'Goosey', 'Winifred', 'Tansy', 'Agatha', 'Hissy', 'Mother Hubbard'],
    male: ['Sir Honk', 'Gandalf the Grey', 'Old Hiss', 'Bartram', 'Aldous', 'Grumble'],
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
  if (a.speciesId === 'pig') return a.sex === 'male' ? 'Sires the piglets' : 'Raises piglets: sell the weaners at market';
  if (a.speciesId === 'goat') {
    if (a.sex === 'male') return 'Gives no milk (but sires the kids), and smells like it';
    return `Milk: <b>${p >= 90 ? 'udder full: milk her now' : p >= 60 ? 'udder well filled' : p >= 30 ? 'udder half full' : 'just milked'}</b>`;
  }
  if (a.speciesId === 'sheep') return `Fleece: <b>${p >= 80 ? 'full: ready to shear' : `${Math.round(p)}% grown`}</b>`;
  if (a.speciesId === 'goose') {
    if (a.sex === 'male') return 'Honks at strangers and keeps the yard (and the geese) in order';
    const eggs = Math.floor(p);
    return `Goose eggs waiting: <b>${eggs ? `${eggs} (worth two hen's eggs apiece)` : 'none just now'}</b>`;
  }
  if (a.sex === 'male') return 'Crows at dawn and keeps the hens in order';
  const eggs = Math.floor(p);
  return `Eggs waiting: <b>${eggs ? eggs : 'none just now'}</b>`;
}

/**
 * A calf, lamb or chick: the breed of one parent (a crossbred youngster takes after either), its
 * size and build between theirs, and the horns its breed and sex give it.
 */
export function inheritLivestock(rng: Rng, speciesId: 'cow' | 'sheep' | 'goat' | 'pig' | 'chicken' | 'goose', mother: AnimalGenome, father: AnimalGenome | undefined, sex: AnimalSex): AnimalGenome {
  const breed = String((father && rng.next() < 0.5 ? father.type : mother.type) ?? '');
  const g = livestockGenome(rng, speciesId, breed || undefined, sex);
  const mix = (a: number, b: number | undefined, male: boolean) => Math.min(1, Math.max(0, ((a + (b ?? a)) / 2) * rng.range(0.92, 1.08) + (male ? 0.1 : -0.05)));
  g.size = mix(mother.size, father?.size, sex === 'male');
  g.build = mix(mother.build, father?.build, sex === 'male');
  return g;
}

/** Days from the ram or the bull to the lamb or the calf, and a broody hen's sitting. */
export const LIVESTOCK_GESTATION: Record<string, number> = { cow: 3.5, sheep: 3, goat: 3, pig: 3, chicken: 1.5, goose: 2 };
/** How many of each the home yard can keep, young ones included. */
export const LIVESTOCK_CAP: Record<string, number> = { cow: 3, sheep: 8, goat: 6, pig: 10, chicken: 14, goose: 10 };

/** What a beast fetches driven to market, before the kingdom's prices: grown, young (and a cow in milk). */
const MARKET_PRICE: Record<string, [number, number]> = { cow: [30, 14], sheep: [14, 7], goat: [12, 6], pig: [18, 8], chicken: [2, 1], goose: [5, 2] };
export function livestockMarketPrice(a: { speciesId: string; stage: string; hasTrait(id: string): boolean }): number {
  const [grown, young] = MARKET_PRICE[a.speciesId] ?? [6, 3];
  return a.stage === 'young' ? young : Math.round(grown * (a.stage === 'elder' ? 0.6 : 1));
}
