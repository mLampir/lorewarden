// Builds data/srd-5.2.1-monsters.json from the SRD 5.2 creature data of the Open5e project.
//
// Usage: node scripts/import-open5e.mjs [git ref of open5e/open5e-api, default "main"]
//
// The creatures are SRD 5.2.1 content by Wizards of the Coast LLC under CC BY 4.0. Open5e excludes
// SRD content from its own license, so the data keeps the SRD license and attribution.
import { writeFileSync } from 'node:fs';

const ref = process.argv[2] ?? 'main';
const base = `https://raw.githubusercontent.com/open5e/open5e-api/${ref}/data/v2/wizards-of-the-coast/srd-2024`;
const output = new URL('../data/srd-5.2.1-monsters.json', import.meta.url);

async function load(name) {
  const response = await fetch(`${base}/${name}.json`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const [creatures, actions, traits] = await Promise.all([
  load('Creature'),
  load('CreatureAction'),
  load('CreatureTrait'),
]);

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const SKILLS = [
  'acrobatics',
  'animal_handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight_of_hand',
  'stealth',
  'survival',
];

// Creatures that are Tiny in the SRD 5.2.1 (hit die d4) but listed as Small in the source data.
const TINY = [
  'badger',
  'bat',
  'cat',
  'crab',
  'flying-snake',
  'frog',
  'hawk',
  'homunculus',
  'imp',
  'lizard',
  'owl',
  'piranha',
  'pseudodragon',
  'quasit',
  'rat',
  'raven',
  'scorpion',
  'seahorse',
  'sphinx-of-wonder',
  'spider',
  'sprite',
  'stirge',
  'venomous-snake',
  'weasel',
  'will-o-wisp',
];

// Errors in the source data, checked against the SRD 5.2.1.
const CORRECTIONS = {
  ...Object.fromEntries(TINY.map((slug) => [`srd-2024_${slug}`, { size: 'tiny' }])),
  'srd-2024_octopus': { ability_score_constitution: 11, ability_score_charisma: 4 },
};

const title = (text) =>
  text.replace(/(^|[\s(])([a-z])/g, (_, before, c) => before + c.toUpperCase());
const signed = (n) => (n < 0 ? `−${-n}` : `+${n}`);
const modifier = (score) => Math.floor((score - 10) / 2);
const libraryId = (pk) => pk.replace(/^srd-2024_/, 'srd-');

function speed(f) {
  const parts = f.walk != null ? [`${f.walk} ft.`] : [];
  for (const kind of ['burrow', 'climb', 'fly', 'swim']) {
    if (f[kind] == null) continue;
    const hover = kind === 'fly' && f.hover ? ' (hover)' : '';
    parts.push(`${title(kind)} ${f[kind]} ft.${hover}`);
  }
  return parts.join(', ');
}

function senses(f) {
  const parts = [];
  for (const kind of ['blindsight', 'darkvision', 'tremorsense', 'truesight']) {
    const range = f[`${kind}_range`];
    if (range) parts.push(`${title(kind)} ${range} ft.`);
  }
  const passive = `Passive Perception ${f.passive_perception}`;
  return parts.length > 0 ? `${parts.join(', ')}; ${passive}` : passive;
}

function usage(action) {
  const { uses_type: type, uses_param: n } = action;
  if (action.name.includes('(') || !type) return '';
  if (type === 'PER_DAY') return ` (${n}/Day)`;
  if (n === 6) return ' (Recharge 6)';
  return n ? ` (Recharge ${n}–6)` : '';
}

const featuresBy = (list, toFeature) => {
  const byParent = new Map();
  for (const entry of list) {
    const parent = entry.fields.parent;
    byParent.set(parent, [...(byParent.get(parent) ?? []), entry.fields]);
  }
  return (pk, filter = () => true) =>
    (byParent.get(pk) ?? [])
      .filter(filter)
      .sort((a, b) => (a.order_in_statblock ?? 0) - (b.order_in_statblock ?? 0))
      .map(toFeature);
};

const traitsOf = featuresBy(traits, (t) => ({ name: t.name, text: t.desc }));
const actionsOf = featuresBy(actions, (a) => {
  const form = a.limited_to_form ? ` (${a.limited_to_form})` : '';
  return { name: `${a.name}${usage(a)}${form}`, text: a.desc };
});

const monsters = creatures
  .map(({ pk, fields }) => {
    const f = { ...fields, ...CORRECTIONS[pk] };
    const abilities = Object.fromEntries(
      ABILITIES.map((a) => [a.slice(0, 3), f[`ability_score_${a}`]]),
    );
    const saves = Object.fromEntries(
      ABILITIES.map((a) => [
        a.slice(0, 3),
        f[`saving_throw_${a}`] ?? modifier(f[`ability_score_${a}`]),
      ]),
    );
    const skills = SKILLS.filter((s) => f[`skill_bonus_${s}`] != null)
      .map(
        (s) =>
          `${title(s.replaceAll('_', ' ')).replace(' Of ', ' of ')} ${signed(f[`skill_bonus_${s}`])}`,
      )
      .join(', ');
    const immunities = [f.damage_immunities_display, f.condition_immunities_display]
      .filter(Boolean)
      .map(title)
      .join('; ');
    const byType = (type) => (a) => a.action_type === type;
    const monster = {
      id: libraryId(pk),
      name: f.name,
      size: f.size,
      type: f.type,
      alignment: f.alignment,
      cr: Number(f.challenge_rating),
      ac: f.armor_class,
      hp: f.hit_points,
      hitDice: f.hit_dice,
      speed: speed(f),
      initiative: f.initiative_bonus ?? modifier(f.ability_score_dexterity),
      abilities,
      saves,
      skills,
      vulnerabilities: title(f.damage_vulnerabilities_display ?? ''),
      resistances: title(f.damage_resistances_display ?? ''),
      immunities,
      senses: senses(f),
      languages: f.languages_desc || 'None',
      traits: traitsOf(pk),
      actions: actionsOf(pk, byType('ACTION')),
      bonusActions: actionsOf(pk, byType('BONUS_ACTION')),
      reactions: actionsOf(pk, byType('REACTION')),
      legendaryActions: actionsOf(pk, byType('LEGENDARY_ACTION')),
    };
    // Leave out empty text and lists to keep the file small.
    return Object.fromEntries(
      Object.entries(monster).filter(([, v]) => v !== '' && !(Array.isArray(v) && v.length === 0)),
    );
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

writeFileSync(output, `${JSON.stringify(monsters, null, 2)}\n`);
console.log(
  `Wrote ${monsters.length} monsters to ${output.pathname.split('/').slice(-2).join('/')}`,
);
