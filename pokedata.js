/*
 * Recursos Pokémon locales (descargados de PokeAPI en assets/, uso privado).
 * Generado a partir de assets/manifest.json: para sumar un Pokémon, agrega
 * su imagen en assets/pokemon/ y su nombre aquí.
 *
 * Lo usan la pantalla principal y el celular.
 */
(function () {
  'use strict';

  /** Nombre como aparece en las preguntas → archivo en assets/pokemon/. */
  const POKEMON = {
      "Bulbasaur": "bulbasaur",
      "Ivysaur": "ivysaur",
      "Charmander": "charmander",
      "Charmeleon": "charmeleon",
      "Charizard": "charizard",
      "Squirtle": "squirtle",
      "Wartortle": "wartortle",
      "Blastoise": "blastoise",
      "Caterpie": "caterpie",
      "Butterfree": "butterfree",
      "Pidgeot": "pidgeot",
      "Pikachu": "pikachu",
      "Raichu": "raichu",
      "Ekans": "ekans",
      "Vulpix": "vulpix",
      "Clefairy": "clefairy",
      "Clefable": "clefable",
      "Jigglypuff": "jigglypuff",
      "Wigglytuff": "wigglytuff",
      "Meowth": "meowth",
      "Psyduck": "psyduck",
      "Machop": "machop",
      "Geodude": "geodude",
      "Ponyta": "ponyta",
      "Kadabra": "kadabra",
      "Alakazam": "alakazam",
      "Magnemite": "magnemite",
      "Dewgong": "dewgong",
      "Gastly": "gastly",
      "Haunter": "haunter",
      "Gengar": "gengar",
      "Onix": "onix",
      "Koffing": "koffing",
      "Seaking": "seaking",
      "Magikarp": "magikarp",
      "Gyarados": "gyarados",
      "Lapras": "lapras",
      "Eevee": "eevee",
      "Vaporeon": "vaporeon",
      "Jolteon": "jolteon",
      "Flareon": "flareon",
      "Snorlax": "snorlax",
      "Articuno": "articuno",
      "Zapdos": "zapdos",
      "Dragonite": "dragonite",
      "Mewtwo": "mewtwo",
      "Mew": "mew",
      "Chikorita": "chikorita",
      "Cyndaquil": "cyndaquil",
      "Totodile": "totodile",
      "Pichu": "pichu",
      "Togepi": "togepi",
      "Espeon": "espeon",
      "Umbreon": "umbreon",
      "Hoppip": "hoppip",
      "Wobbuffet": "wobbuffet",
      "Steelix": "steelix",
      "Kingdra": "kingdra",
      "Suicune": "suicune",
      "Lugia": "lugia",
      "Ho-Oh": "ho-oh",
      "Celebi": "celebi",
      "Treecko": "treecko",
      "Torchic": "torchic",
      "Mudkip": "mudkip",
      "Gardevoir": "gardevoir",
      "Wailord": "wailord",
      "Milotic": "milotic",
      "Snorunt": "snorunt",
      "Kyogre": "kyogre",
      "Groudon": "groudon",
      "Rayquaza": "rayquaza",
      "Deoxys": "deoxys",
      "Riolu": "riolu",
      "Lucario": "lucario",
      "Leafeon": "leafeon",
      "Glaceon": "glaceon",
      "Rotom": "rotom",
      "Arceus": "arceus",
      "Genesect": "genesect",
      "Sylveon": "sylveon",
      "Chansey": "chansey",
      "Diglett": "diglett",
      "Zubat": "zubat",
      "Dodrio": "dodrio",
      "Tentacool": "tentacool",
    "Raikou": "raikou",
    "Entei": "entei",
    "Miltank": "miltank",
    "Dialga": "dialga",
    "Giratina": "giratina",
    "Jirachi": "jirachi"
  };

  /** Tipo en español → archivo en assets/types/. */
  const TYPES = {
      "Normal": "normal",
      "Lucha": "fighting",
      "Volador": "flying",
      "Veneno": "poison",
      "Tierra": "ground",
      "Roca": "rock",
      "Bicho": "bug",
      "Fantasma": "ghost",
      "Acero": "steel",
      "Fuego": "fire",
      "Agua": "water",
      "Planta": "grass",
      "Eléctrico": "electric",
      "Psíquico": "psychic",
      "Hielo": "ice",
      "Dragón": "dragon",
      "Siniestro": "dark",
      "Hada": "fairy"
  };

  // Nombres más largos primero, para que "Mewtwo" gane a "Mew".
  const NAMES = Object.keys(POKEMON).sort((a, b) => b.length - a.length);
  // Un nombre cuenta solo si no está pegado a otras letras ("Mew" no coincide dentro de "Mewtwo").
  const NAME_RE = new RegExp(String.raw`(^|[^\p{L}])(` + NAMES.join('|') + String.raw`)(?![\p{L}])`, 'gu');

  /** Pokémon nombrados en un texto, sin repetir y en orden de aparición. */
  function findPokemon(text) {
    const found = [];
    for (const m of String(text).matchAll(NAME_RE)) {
      if (!found.includes(m[2])) found.push(m[2]);
    }
    return found;
  }

  /** Si el texto es un nombre de Pokémon exacto, lo devuelve. */
  function exactPokemon(text) {
    const t = String(text).trim();
    return POKEMON[t] ? t : null;
  }

  /** "Fuego/Volador" → ['Fuego', 'Volador'] si todas las partes son tipos; si no, []. */
  function typeParts(text) {
    const parts = String(text).split('/').map((s) => s.trim());
    return parts.every((p) => TYPES[p]) ? parts : [];
  }

  window.PokeData = {
    POKEMON,
    TYPES,
    findPokemon,
    exactPokemon,
    typeParts,
    artPath: (slug) => `assets/pokemon/${slug}.png`,
    pokemonArt: (name) => (POKEMON[name] ? `assets/pokemon/${POKEMON[name]}.png` : null),
    typePath: (es) => `assets/types/${TYPES[es]}.png`,
    badgePath: (slug) => `assets/badges/${slug}.png`,
    itemPath: (slug) => `assets/items/${slug}.png`,
    cryPath: (slug) => `assets/cries/${slug}.ogg`,
  };
})();
