#!/usr/bin/env python3
"""Genera el banco de preguntas de la categoria TIPOS a partir de los CSV de PokeAPI.

Uso (desde cualquier carpeta):
    python tools/question-gen/gen_tipos.py

Salida: games/carrera-de-medallas/questions-tipos.js (exactamente 500 preguntas).
Determinista: usa random.Random con semilla fija. Solo biblioteca estandar.
"""
import csv
import json
import os
import random
import re
import subprocess
import sys
from collections import Counter, defaultdict
from itertools import combinations

SEED = 20261001
TOTAL = 500
MAX_TEMPLATE_SHARE = 0.25
ES = '7'

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.normpath(os.path.join(HERE, '..', '..'))
DATA_DIR = os.path.join(GAME_DIR, 'tools', 'pokeapi-data')
OUT_PATH = os.path.join(GAME_DIR, 'questions-tipos.js')
EXISTING_PATH = os.path.join(GAME_DIR, 'questions.js')

rng = random.Random(SEED)


def fail(msg):
    sys.stderr.write('ERROR: ' + msg + '\n')
    sys.exit(1)


def read_csv(name):
    with open(os.path.join(DATA_DIR, name), encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- datos

TYPE_IDS = list(range(1, 19))  # 18 tipos estandar (sin Astral ni ids >= 10000)
TYPE_NAME = {}
for r in read_csv('type_names.csv'):
    if r['local_language_id'] == ES and int(r['type_id']) in TYPE_IDS:
        TYPE_NAME[int(r['type_id'])] = r['name']
if len(TYPE_NAME) != 18:
    fail('faltan nombres de tipo en espanol')

EFF = {}  # (atk, def) -> factor en cuartos: 0,2,4,8 (x0, x0,5, x1, x2)
for r in read_csv('type_efficacy.csv'):
    a, d = int(r['damage_type_id']), int(r['target_type_id'])
    if a in TYPE_IDS and d in TYPE_IDS:
        EFF[(a, d)] = {0: 0, 50: 2, 100: 4, 200: 8}[int(r['damage_factor'])]
if len(EFF) != 18 * 18:
    fail('tabla de tipos incompleta: %d' % len(EFF))


def mult_q(atk, types):
    """Multiplicador en cuartos (0,1,2,4,8,16) de un ataque contra una combinacion."""
    m = 4
    for t in types:
        m = m * EFF[(atk, t)] // 4
    return m


MULT_TXT = {0: 'x0', 1: 'x0,25', 2: 'x0,5', 4: 'x1', 8: 'x2', 16: 'x4'}
ALL_MULTS = [16, 8, 4, 2, 1, 0]

SPECIES_NAME = {}
for r in read_csv('pokemon_species_names.csv'):
    if r['local_language_id'] == ES:
        SPECIES_NAME[int(r['pokemon_species_id'])] = r['name']

SPECIES = {}
for r in read_csv('pokemon_species.csv'):
    SPECIES[int(r['id'])] = r

POKE_TYPES = defaultdict(list)
for r in read_csv('pokemon_types.csv'):
    POKE_TYPES[int(r['pokemon_id'])].append((int(r['slot']), int(r['type_id'])))

POKEMON_ROWS = read_csv('pokemon.csv')

# Especies cuyo tipo depende de la forma (Rotom, Wormadam, Oricorio, Castform, Hoopa, Ogerpon...)
# se excluyen para que "¿De qué tipo es X?" no sea discutible. Megas, Gigamax y formas
# regionales no cuentan (la pregunta se refiere siempre a la forma normal). Arceus y Silvally
# cambian de tipo por objeto/forma (sus formas no aparecen en pokemon.csv).
AMBIGUOUS_SPECIES = {493, 773}
_default_types = {}
for r in POKEMON_ROWS:
    if r['is_default'] == '1':
        _default_types[int(r['species_id'])] = sorted(t for _, t in POKE_TYPES[int(r['id'])])
for r in POKEMON_ROWS:
    if r['is_default'] == '0' and not re.search(r'-(mega|gmax|alola|galar|hisui|paldea)', r['identifier']):
        sid = int(r['species_id'])
        if sorted(t for _, t in POKE_TYPES[int(r['id'])]) != _default_types.get(sid):
            AMBIGUOUS_SPECIES.add(sid)

POKEMON = {}  # species id -> tuple de tipos ordenados por slot
for r in POKEMON_ROWS:
    pid, sid = int(r['id']), int(r['species_id'])
    if r['is_default'] == '1' and pid == sid and pid <= 1025 and sid not in AMBIGUOUS_SPECIES:
        types = tuple(t for _, t in sorted(POKE_TYPES[pid]))
        if not types or any(t not in TYPE_IDS for t in types):
            fail('tipos raros para pokemon %d' % pid)
        if pid not in SPECIES_NAME:
            fail('sin nombre en espanol: %d' % pid)
        POKEMON[pid] = types

EVOLVES_FROM = {}
for sid, r in SPECIES.items():
    if r['evolves_from_species_id'] and sid in POKEMON:
        EVOLVES_FROM[sid] = int(r['evolves_from_species_id'])


def tn(t):
    return TYPE_NAME[t]


def combo_txt(types):
    return '/'.join(tn(t) for t in types)


def pname(sid):
    return SPECIES_NAME[sid]


def band(sid):
    if sid <= 251:
        return 0
    if sid <= 493:
        return 1
    return 2


BAND_WEIGHTS = [0.55, 0.30, 0.15]
BAND_LISTS = [[s for s in sorted(POKEMON) if band(s) == b] for b in range(3)]


def weighted_species_order():
    """Orden de especies (sin repetir) muestreado con el peso 55/30/15 por bandas."""
    pools = [lst[:] for lst in BAND_LISTS]
    for p in pools:
        rng.shuffle(p)
    order = []
    while any(pools):
        b = rng.choices([0, 1, 2], weights=BAND_WEIGHTS)[0]
        if pools[b]:
            order.append(pools[b].pop())
    return order


def poke_difficulty(sid):
    return 'easy' if sid <= 493 else 'medium'


def weaknesses(types):
    return [a for a in TYPE_IDS if mult_q(a, types) >= 8]


def join_es(items):
    items = list(items)
    if len(items) == 1:
        return items[0]
    return ', '.join(items[:-1]) + ' y ' + items[-1]


# Preguntas ya existentes (no repetir textos).
with open(EXISTING_PATH, encoding='utf-8') as f:
    EXISTING_Q = set(m.group(1) for m in re.finditer(r"q:\s*'((?:[^'\\]|\\.)*)'", f.read()))
EXISTING_BLOB = '\n'.join(EXISTING_Q)

COMMON_TYPES = {10, 11, 12, 13, 5, 15, 6, 3}  # Fuego Agua Planta Electrico Tierra Hielo Roca Volador


def Q(template, q, correct, wrong, explain, diff):
    return {'template': template, 'q': q, 'correct': correct, 'wrong': list(wrong),
            'explain': explain, 'difficulty': diff}


def pick_types(pred, k, exclude=()):
    pool = [t for t in TYPE_IDS if pred(t) and t not in exclude]
    if len(pool) < k:
        return None
    return rng.sample(pool, k)


# ---------------------------------------------------------------- plantillas

def t_tipo_de_pokemon():
    out = []
    for sid in weighted_species_order():
        types = POKEMON[sid]
        name = pname(sid)
        if re.search(r'(?<!\w)%s(?!\w)' % re.escape(name), EXISTING_BLOB):
            continue  # evita casi-duplicados de preguntas escritas a mano
        if len(types) == 1:
            # Puro: dos combinaciones que incluyen su tipo y otro tipo puro.
            t = types[0]
            others = [x for x in TYPE_IDS if x != t]
            a, b, c = rng.sample(others, 3)
            wrong = [combo_txt((t, a)), combo_txt((b, t)), tn(c)]
            correct = tn(t)
            explain = '%s es de tipo %s puro.' % (name, correct)
        else:
            # Doble: el primer tipo solo (¿o era puro?) y dos combinaciones parecidas.
            t1, t2 = types
            others = [x for x in TYPE_IDS if x not in types]
            a, b = rng.sample(others, 2)
            wrong = [combo_txt((t1, a)), combo_txt((b, t2)), tn(t1)]
            correct = combo_txt(types)
            explain = '%s combina los tipos %s y %s.' % (name, tn(t1), tn(t2))
        out.append(Q('tipo_de_pokemon', '¿De qué tipo es %s?' % name, correct, wrong,
                     explain, poke_difficulty(sid)))
    return out


def t_pokemon_de_tipo():
    out = []
    order = weighted_species_order()
    by_band = defaultdict(list)
    for s in order:
        by_band[band(s)].append(s)
    used = set()
    for sid in order:
        if sid in used:
            continue
        types = POKEMON[sid]
        pure = len(types) == 1 and rng.random() < 0.35
        t = types[0] if pure else rng.choice(types)
        if pure:
            q = '¿Cuál de estos Pokémon es de tipo %s puro?' % tn(t)
            ok = lambda s: POKEMON[s] == (t,)
            explain = '%s es de tipo %s puro; los demás no.' % (pname(sid), tn(t))
        else:
            q = '¿Cuál de estos Pokémon tiene el tipo %s?' % tn(t)
            ok = lambda s: t in POKEMON[s]
            explain = '%s es de tipo %s.' % (pname(sid), combo_txt(types))
        # distractores de la misma banda, que no cumplan la condicion; para "puro",
        # se prefiere alguno que tenga T combinado (mas engañoso).
        cands = [s for s in by_band[band(sid)] if s != sid and s not in used and not ok(s)]
        if pure:
            tricky = [s for s in cands if t in POKEMON[s]]
            wrong_ids = ([rng.choice(tricky)] if tricky else [])
            rest = [s for s in cands if s not in wrong_ids]
            wrong_ids += rng.sample(rest, 3 - len(wrong_ids))
        else:
            wrong_ids = rng.sample(cands, 3)
        if q in {o['q'] for o in out}:
            # mismo texto ya usado: se diferencia nombrando la condicion de otra forma
            q = '¿Qué Pokémon de esta lista es de tipo %s%s?' % (tn(t), ' puro' if pure else '')
            if q in {o['q'] for o in out}:
                continue
        used.update([sid] + wrong_ids)
        out.append(Q('pokemon_de_tipo', q, pname(sid), [pname(s) for s in wrong_ids],
                     explain, poke_difficulty(max([sid] + wrong_ids))))
    return out


def t_debilidad_de_tipo():
    """Lado defensor: que ataque es super eficaz contra T."""
    out = []
    phr = ['¿Qué tipo de ataque es súper eficaz contra el tipo %s?',
           '¿A qué tipo de ataque es débil un Pokémon de tipo %s puro?']
    for p in phr:
        for d in TYPE_IDS:
            weak = [a for a in TYPE_IDS if EFF[(a, d)] == 8]
            a = rng.choice(weak)
            wrong = pick_types(lambda x: EFF[(x, d)] < 8, 3)
            out.append(Q('debilidad_de_tipo', p % tn(d), tn(a), [tn(w) for w in wrong],
                         'El tipo %s es débil a %s.' % (tn(d), join_es(tn(w) for w in weak)),
                         'easy' if d in COMMON_TYPES else 'medium'))
    return out


def t_super_eficaz_ofensivo():
    out = []
    phr = ['¿Contra cuál de estos tipos es súper eficaz el tipo %s?',
           '¿A qué tipo le hacen el doble de daño los ataques de tipo %s?']
    for p in phr:
        for a in TYPE_IDS:
            strong = [d for d in TYPE_IDS if EFF[(a, d)] == 8]
            if not strong:
                continue
            d = rng.choice(strong)
            wrong = pick_types(lambda x: EFF[(a, x)] < 8, 3)
            out.append(Q('super_eficaz_ofensivo', p % tn(a), tn(d), [tn(w) for w in wrong],
                         'Los ataques de tipo %s son súper eficaces contra %s.'
                         % (tn(a), join_es(tn(x) for x in strong)),
                         'easy' if a in COMMON_TYPES else 'medium'))
    return out


def t_resistencia_inmunidad():
    out = []
    for a in TYPE_IDS:  # que tipo resiste A (x0,5), distractores x1/x2 (nunca x0)
        res = [d for d in TYPE_IDS if EFF[(a, d)] == 2]
        if res:
            d = rng.choice(res)
            wrong = pick_types(lambda x: EFF[(a, x)] >= 4, 3)
            out.append(Q('resistencia_inmunidad', '¿Qué tipo resiste los ataques de tipo %s?' % tn(a),
                         tn(d), [tn(w) for w in wrong],
                         'Resisten los ataques de tipo %s: %s.' % (tn(a), join_es(tn(x) for x in res)),
                         'medium'))
        imm = [d for d in TYPE_IDS if EFF[(a, d)] == 0]
        if imm:
            d = rng.choice(imm)
            wrong = pick_types(lambda x: EFF[(a, x)] > 0, 3)
            out.append(Q('resistencia_inmunidad', '¿Qué tipo es inmune a los ataques de tipo %s?' % tn(a),
                         tn(d), [tn(w) for w in wrong],
                         'Los ataques de tipo %s no afectan a %s.' % (tn(a), join_es(tn(x) for x in imm)),
                         'easy'))
    for d in TYPE_IDS:
        imm = [a for a in TYPE_IDS if EFF[(a, d)] == 0]
        if imm:
            a = rng.choice(imm)
            wrong = pick_types(lambda x: EFF[(x, d)] > 0, 3)
            out.append(Q('resistencia_inmunidad', '¿A qué tipo de ataques es inmune el tipo %s?' % tn(d),
                         tn(a), [tn(w) for w in wrong],
                         'El tipo %s no recibe daño de ataques de tipo %s.' % (tn(d), join_es(tn(x) for x in imm)),
                         'easy'))
        res = [a for a in TYPE_IDS if EFF[(a, d)] == 2]
        if res:
            a = rng.choice(res)
            wrong = pick_types(lambda x: EFF[(x, d)] >= 4, 3)
            out.append(Q('resistencia_inmunidad', '¿Qué tipo de ataque resiste el tipo %s?' % tn(d),
                         tn(a), [tn(w) for w in wrong],
                         'El tipo %s recibe la mitad de daño de: %s.' % (tn(d), join_es(tn(x) for x in res)),
                         'medium'))
    return out


def t_poco_eficaz():
    out = []
    for a in TYPE_IDS:
        res = [d for d in TYPE_IDS if EFF[(a, d)] == 2]
        if res:
            d = rng.choice(res)
            wrong = pick_types(lambda x: EFF[(a, x)] >= 4, 3)
            out.append(Q('poco_eficaz', '¿Contra cuál de estos tipos es poco eficaz el tipo %s?' % tn(a),
                         tn(d), [tn(w) for w in wrong],
                         'El tipo %s es poco eficaz (x0,5) contra %s.' % (tn(a), join_es(tn(x) for x in res)),
                         'medium'))
    for d in TYPE_IDS:
        res = [a for a in TYPE_IDS if EFF[(a, d)] == 2]
        if res:
            a = rng.choice(res)
            wrong = pick_types(lambda x: EFF[(x, d)] >= 4, 3)
            out.append(Q('poco_eficaz', '¿Qué tipo de ataque es poco eficaz contra el tipo %s?' % tn(d),
                         tn(a), [tn(w) for w in wrong],
                         'Contra el tipo %s son poco eficaces: %s.' % (tn(d), join_es(tn(x) for x in res)),
                         'medium'))
    return out


def mult_options(m):
    wrong = rng.sample([x for x in ALL_MULTS if x != m], 3)
    return MULT_TXT[m], [MULT_TXT[x] for x in wrong]


def mult_difficulty(m):
    return {8: 'easy', 0: 'easy', 4: 'medium', 2: 'medium', 16: 'medium', 1: 'hard'}[m]


TARGET_MULT_WEIGHTS = {8: 0.25, 16: 0.2, 4: 0.12, 2: 0.18, 1: 0.12, 0: 0.13}


def mult_explain(a, types):
    parts = ['%s contra %s es %s' % (tn(a), tn(t), MULT_TXT[EFF[(a, t)]]) for t in types]
    if len(types) == 1:
        return parts[0][0].upper() + parts[0][1:] + '.'
    return '%s; en total %s.' % (join_es(parts), MULT_TXT[mult_q(a, types)])


def choose_attack_for(types):
    by_m = defaultdict(list)
    for a in TYPE_IDS:
        by_m[mult_q(a, types)].append(a)
    ms = [m for m in TARGET_MULT_WEIGHTS if by_m[m]]
    m = rng.choices(ms, weights=[TARGET_MULT_WEIGHTS[x] for x in ms])[0]
    return rng.choice(by_m[m]), m


def t_multiplicador_pokemon():
    out = []
    for sid in weighted_species_order():
        types = POKEMON[sid]
        if len(types) != 2:
            continue
        a, m = choose_attack_for(types)
        correct, wrong = mult_options(m)
        q = 'Un ataque de tipo %s contra %s (%s), ¿cuánto daño hace?' % (tn(a), pname(sid), combo_txt(types))
        d = mult_difficulty(m)
        if sid > 493 and d == 'easy':
            d = 'medium'
        out.append(Q('multiplicador_pokemon', q, correct, wrong, mult_explain(a, types), d))
    return out


def all_dual_combos():
    seen, res = set(), []
    for sid in sorted(POKEMON):
        t = POKEMON[sid]
        if len(t) == 2 and frozenset(t) not in seen:
            seen.add(frozenset(t))
            res.append(t)
    return res


def t_multiplicador_combinacion():
    out = []
    combos = all_dual_combos()
    rng.shuffle(combos)
    for types in combos:
        a, m = choose_attack_for(types)
        correct, wrong = mult_options(m)
        q = '¿Cuánto daño hace un ataque de tipo %s a un Pokémon de tipo %s?' % (tn(a), combo_txt(types))
        out.append(Q('multiplicador_combinacion', q, correct, wrong, mult_explain(a, types),
                     'hard' if m in (1, 16) else mult_difficulty(m)))
    return out


def count_options(n):
    pool = [x for x in range(max(0, n - 3), n + 4) if x != n]
    wrong = rng.sample(pool, 3)
    return str(n), [str(x) for x in wrong]


def t_num_debilidades():
    out = []
    for t in TYPE_IDS:
        w = weaknesses((t,))
        correct, wrong = count_options(len(w))
        out.append(Q('num_debilidades', '¿Cuántas debilidades tiene un Pokémon de tipo %s puro?' % tn(t),
                     correct, wrong, 'El tipo %s puro es débil a %s.' % (tn(t), join_es(tn(x) for x in w)),
                     'hard'))
    combos = all_dual_combos()
    rng.shuffle(combos)
    for types in combos:
        w = weaknesses(types)
        if not w:
            continue
        correct, wrong = count_options(len(w))
        q = '¿A cuántos tipos de ataque es débil (x2 o más) un Pokémon de tipo %s?' % combo_txt(types)
        out.append(Q('num_debilidades', q, correct, wrong,
                     'La combinación %s es débil a %s.' % (combo_txt(types), join_es(tn(x) for x in w)),
                     'hard'))
    return out


IMMUNITY_MOVES = ['tackle', 'body-slam', 'hyper-beam', 'quick-attack', 'close-combat', 'brick-break',
                  'karate-chop', 'focus-blast', 'earthquake', 'dig', 'mud-slap', 'earth-power',
                  'thunderbolt', 'thunder', 'thunder-punch', 'spark', 'psybeam', 'confusion',
                  'zen-headbutt', 'dragon-claw', 'outrage', 'dragon-pulse', 'draco-meteor',
                  'sludge-bomb', 'poison-jab', 'sludge', 'acid', 'shadow-ball', 'shadow-claw',
                  'lick', 'hex']


def t_pokemon_inmune():
    move_name = {r['move_id']: r['name'] for r in read_csv('move_names.csv') if r['local_language_id'] == ES}
    moves = {}
    for r in read_csv('moves.csv'):
        if r['identifier'] in IMMUNITY_MOVES:
            if r['damage_class_id'] == '1' or not r['power']:
                fail('movimiento no ofensivo en la lista: ' + r['identifier'])
            moves[r['identifier']] = (move_name[r['id']], int(r['type_id']))
    if len(moves) != len(IMMUNITY_MOVES):
        fail('faltan movimientos en los datos')
    out = []
    order = weighted_species_order()
    for ident in IMMUNITY_MOVES:
        mv, a = moves[ident]
        imm = [s for s in order if mult_q(a, POKEMON[s]) == 0]
        hit = [s for s in order if mult_q(a, POKEMON[s]) > 0]
        sid = imm[rng.randrange(min(len(imm), 15))]
        wrong = rng.sample(hit[:60], 3)
        immt = [t for t in POKEMON[sid] if EFF[(a, t)] == 0]
        q = 'Sin contar habilidades, ¿qué Pokémon no recibe daño de %s (tipo %s)?' % (mv, tn(a))
        out.append(Q('pokemon_inmune', q, pname(sid), [pname(s) for s in wrong],
                     '%s es de tipo %s, inmune a los ataques de tipo %s.'
                     % (pname(sid), tn(immt[0]), tn(a)), 'easy' if a in (1, 5, 13) else 'medium'))
    return out


def t_debil_x4():
    out = []
    for sid in weighted_species_order():
        types = POKEMON[sid]
        if len(types) != 2:
            continue
        x4 = [a for a in TYPE_IDS if mult_q(a, types) == 16]
        if not x4:
            continue
        a = rng.choice(x4)
        # distractores: preferimos tipos x2 (plausibles), luego cualquiera que no sea x4
        x2 = [t for t in TYPE_IDS if mult_q(t, types) == 8]
        rest = [t for t in TYPE_IDS if mult_q(t, types) < 8]
        k = min(len(x2), rng.choice([1, 2]))
        wrong = rng.sample(x2, k) + rng.sample(rest, 3 - k)
        out.append(Q('debil_x4', '¿A qué tipo de ataque es débil x4 %s?' % pname(sid), tn(a),
                     [tn(w) for w in wrong],
                     '%s es %s y recibe x4 de %s.' % (pname(sid), combo_txt(types), join_es(tn(x) for x in x4)),
                     'easy' if sid <= 251 else ('medium' if sid <= 493 else 'hard')))
    return out


def t_evolucion_tipo():
    out = []
    items = sorted(EVOLVES_FROM.items())
    rng.shuffle(items)
    items.sort(key=lambda kv: band(kv[0]))  # prioriza especies clasicas
    for child, parent in items:
        if parent not in POKEMON:
            continue
        pt, ct = set(POKEMON[parent]), set(POKEMON[child])
        gained = ct - pt
        if len(gained) != 1 or not pt <= ct:
            continue
        g = gained.pop()
        wrong = pick_types(lambda x: x not in ct, 3)
        q = 'Cuando %s evoluciona a %s, ¿qué tipo gana?' % (pname(parent), pname(child))
        out.append(Q('evolucion_tipo', q, tn(g), [tn(w) for w in wrong],
                     '%s es %s y %s pasa a ser %s.' % (pname(parent), combo_txt(POKEMON[parent]),
                                                       pname(child), combo_txt(POKEMON[child])),
                     'hard'))
    return out


QUOTAS = [  # (generador, cuota)
    # Menos tabla de tipos básica (Agua > Fuego…) y más cuentas con dos tipos.
    (t_tipo_de_pokemon, 85),
    (t_pokemon_de_tipo, 40),
    (t_debilidad_de_tipo, 15),
    (t_super_eficaz_ofensivo, 15),
    (t_resistencia_inmunidad, 20),
    (t_poco_eficaz, 15),
    (t_multiplicador_pokemon, 110),
    (t_multiplicador_combinacion, 60),
    (t_num_debilidades, 35),
    (t_pokemon_inmune, 35),
    (t_debil_x4, 45),
    (t_evolucion_tipo, 25),
]
FILLERS = ['multiplicador_pokemon', 'tipo_de_pokemon', 'multiplicador_combinacion', 'debil_x4']


# ---------------------------------------------------------------- validacion

TYPE_BY_NAME = {v: k for k, v in TYPE_NAME.items()}
POKE_BY_NAME = {pname(s): s for s in POKEMON}
MULT_BY_TXT = {v: k for k, v in MULT_TXT.items()}


def parse_types(txt):
    return tuple(TYPE_BY_NAME[p] for p in txt.split('/'))


def verify_semantics(it):
    """Recalcula, a partir del texto de la pregunta, que opciones son correctas."""
    tpl, q, opts = it['template'], it['q'], [it['correct']] + it['wrong']

    def only_correct(pred):
        flags = [bool(pred(o)) for o in opts]
        return flags[0] and sum(flags) == 1

    def grab(pattern):
        m = re.match(pattern, q)
        if not m:
            fail('patron no reconocido (%s): %s' % (tpl, q))
        return m.groups()

    if tpl == 'tipo_de_pokemon':
        (name,) = grab(r'¿De qué tipo es (.+)\?$')
        s = POKE_BY_NAME[name]
        return only_correct(lambda o: set(parse_types(o)) == set(POKEMON[s]))
    if tpl == 'pokemon_de_tipo':
        t, pure = grab(r'¿(?:Cuál de estos Pokémon tiene el|Cuál de estos Pokémon es de|Qué Pokémon de esta lista es de) tipo (\S+)( puro)?\?$')
        t = TYPE_BY_NAME[t]
        if pure:
            return only_correct(lambda o: POKEMON[POKE_BY_NAME[o]] == (t,))
        return only_correct(lambda o: t in POKEMON[POKE_BY_NAME[o]])
    if tpl == 'debilidad_de_tipo':
        (d,) = grab(r'.*tipo (\S+?)(?: puro)?\?$')
        return only_correct(lambda o: EFF[(TYPE_BY_NAME[o], TYPE_BY_NAME[d])] == 8)
    if tpl == 'super_eficaz_ofensivo':
        (a,) = grab(r'.*tipo (\S+)\?$')
        return only_correct(lambda o: EFF[(TYPE_BY_NAME[a], TYPE_BY_NAME[o])] == 8)
    if tpl == 'resistencia_inmunidad':
        if q.startswith('¿Qué tipo resiste'):
            (a,) = grab(r'.*tipo (\S+)\?$')
            return only_correct(lambda o: EFF[(TYPE_BY_NAME[a], TYPE_BY_NAME[o])] <= 2)
        if q.startswith('¿Qué tipo es inmune'):
            (a,) = grab(r'.*tipo (\S+)\?$')
            return only_correct(lambda o: EFF[(TYPE_BY_NAME[a], TYPE_BY_NAME[o])] == 0)
        if q.startswith('¿A qué tipo de ataques es inmune'):
            (d,) = grab(r'.*tipo (\S+)\?$')
            return only_correct(lambda o: EFF[(TYPE_BY_NAME[o], TYPE_BY_NAME[d])] == 0)
        (d,) = grab(r'¿Qué tipo de ataque resiste el tipo (\S+)\?$')
        return only_correct(lambda o: EFF[(TYPE_BY_NAME[o], TYPE_BY_NAME[d])] <= 2)
    if tpl == 'poco_eficaz':
        if q.startswith('¿Contra'):
            (a,) = grab(r'.*el tipo (\S+)\?$')
            return only_correct(lambda o: EFF[(TYPE_BY_NAME[a], TYPE_BY_NAME[o])] == 2)
        (d,) = grab(r'.*contra el tipo (\S+)\?$')
        return only_correct(lambda o: EFF[(TYPE_BY_NAME[o], TYPE_BY_NAME[d])] == 2)
    if tpl == 'multiplicador_pokemon':
        a, name, combo = grab(r'Un ataque de tipo (\S+) contra (.+) \((\S+)\), ¿cuánto daño hace\?$')
        types = POKEMON[POKE_BY_NAME[name]]
        if set(parse_types(combo)) != set(types):
            fail('tipos mal mostrados: ' + q)
        return only_correct(lambda o: MULT_BY_TXT[o] == mult_q(TYPE_BY_NAME[a], types))
    if tpl == 'multiplicador_combinacion':
        a, combo = grab(r'¿Cuánto daño hace un ataque de tipo (\S+) a un Pokémon de tipo (\S+)\?$')
        return only_correct(lambda o: MULT_BY_TXT[o] == mult_q(TYPE_BY_NAME[a], parse_types(combo)))
    if tpl == 'num_debilidades':
        (combo,) = grab(r'.*tipo (\S+?)(?: puro)?\?$')
        return only_correct(lambda o: int(o) == len(weaknesses(parse_types(combo))))
    if tpl == 'pokemon_inmune':
        (a,) = grab(r'.*\(tipo (\S+)\)\?$')
        return only_correct(lambda o: mult_q(TYPE_BY_NAME[a], POKEMON[POKE_BY_NAME[o]]) == 0)
    if tpl == 'debil_x4':
        (name,) = grab(r'¿A qué tipo de ataque es débil x4 (.+)\?$')
        return only_correct(lambda o: mult_q(TYPE_BY_NAME[o], POKEMON[POKE_BY_NAME[name]]) == 16)
    if tpl == 'evolucion_tipo':
        p, c = grab(r'Cuando (.+) evoluciona a (.+), ¿qué tipo gana\?$')
        gained = set(POKEMON[POKE_BY_NAME[c]]) - set(POKEMON[POKE_BY_NAME[p]])
        return only_correct(lambda o: TYPE_BY_NAME[o] in gained)
    fail('plantilla sin verificar: ' + tpl)


def answer_in_question(it):
    return re.search(r'(?<![\wÁÉÍÓÚáéíóúÑñ])' + re.escape(it['correct']) + r'(?![\wÁÉÍÓÚáéíóúÑñ])',
                     it['q']) is not None


def valid_item(it):
    opts = [it['correct']] + it['wrong']
    if len(it['wrong']) != 3 or any(not isinstance(o, str) or not o.strip() for o in opts):
        return False
    if len(set(opts)) != 4 or '¿' not in it['q'] or not it['q'].endswith('?') or not it['explain'].strip():
        return False
    if it['q'] in EXISTING_Q or answer_in_question(it):
        return False
    # en opciones de tipos, dos opciones no pueden ser la misma combinacion en otro orden
    if all(all(p in TYPE_BY_NAME for p in o.split('/')) for o in opts):
        if len({frozenset(o.split('/')) for o in opts}) != 4:
            return False
    return verify_semantics(it)


# ---------------------------------------------------------------- ensamblado

def build():
    pools = {}
    for gen, quota in QUOTAS:
        items = gen()
        if not items:
            fail('plantilla vacia: ' + gen.__name__)
        pools[items[0]['template']] = (items, quota)
    cap = int(TOTAL * MAX_TEMPLATE_SHARE)
    seen_q = set()
    chosen = defaultdict(list)
    leftovers = {}
    for tpl, (items, quota) in pools.items():
        rest = []
        for it in items:
            if it['q'] in seen_q or not valid_item(it):
                continue
            if len(chosen[tpl]) < quota:
                chosen[tpl].append(it)
                seen_q.add(it['q'])
            else:
                rest.append(it)
        leftovers[tpl] = rest
    total = sum(len(v) for v in chosen.values())
    while total < TOTAL:
        progressed = False
        for tpl in FILLERS:
            if total >= TOTAL:
                break
            while leftovers[tpl] and len(chosen[tpl]) < cap:
                it = leftovers[tpl].pop(0)
                if it['q'] not in seen_q:
                    chosen[tpl].append(it)
                    seen_q.add(it['q'])
                    total += 1
                    progressed = True
                    break
        if not progressed:
            fail('no hay suficientes preguntas validas (%d)' % total)
    result = []
    for tpl in pools:
        result.extend(chosen[tpl])
    rng.shuffle(result)
    return result


def final_checks(items):
    if len(items) != TOTAL:
        fail('cuenta incorrecta: %d' % len(items))
    qs = [it['q'] for it in items]
    if len(set(qs)) != len(qs):
        fail('preguntas duplicadas')
    cnt = Counter(it['template'] for it in items)
    if len(cnt) < 8:
        fail('menos de 8 plantillas')
    for tpl, n in cnt.items():
        if n > TOTAL * MAX_TEMPLATE_SHARE:
            fail('plantilla %s supera el 25%%: %d' % (tpl, n))
    for it in items:
        if not valid_item(it):
            fail('item invalido: %r' % it)
    return cnt


def write_js(items):
    lines = ['/* Generado por tools/question-gen/gen_tipos.py a partir de datos de PokeAPI. '
             'No editar a mano: volver a correr el generador. */',
             'window.QUESTION_BANK = window.QUESTION_BANK || {};',
             'window.QUESTION_BANK.tipos = (window.QUESTION_BANK.tipos || []).concat([']
    for it in items:
        d = lambda s: json.dumps(s, ensure_ascii=False)
        lines.append('  { q: %s, correct: %s, wrong: [%s], explain: %s },'
                     % (d(it['q']), d(it['correct']), ', '.join(d(w) for w in it['wrong']), d(it['explain'])))
    lines.append(']);')
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def node_check():
    js = ("global.window={};eval(require('fs').readFileSync('questions-tipos.js','utf8'));"
          "console.log(window.QUESTION_BANK.tipos.length)")
    try:
        out = subprocess.run(['node', '-e', js], cwd=GAME_DIR, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        print('AVISO: node no esta disponible; no se pudo verificar el JS.')
        return
    except subprocess.CalledProcessError as e:
        fail('node no pudo parsear el archivo: ' + e.stderr)
    if out.stdout.strip() != str(TOTAL):
        fail('node conto %r preguntas' % out.stdout.strip())
    print('node: %s preguntas parseadas OK' % out.stdout.strip())


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    items = build()
    cnt = final_checks(items)
    write_js(items)
    print('Escrito %s (%d preguntas)' % (OUT_PATH, len(items)))
    print('\nPor plantilla:')
    for tpl, n in sorted(cnt.items(), key=lambda kv: -kv[1]):
        print('  %-28s %3d (%.1f%%)' % (tpl, n, 100.0 * n / TOTAL))
    dc = Counter(it['difficulty'] for it in items)
    print('\nDificultad: ' + ', '.join('%s=%d (%.0f%%)' % (k, dc[k], 100.0 * dc[k] / TOTAL)
                                         for k in ('easy', 'medium', 'hard')))
    print('\nMuestra de 25 preguntas:')
    for it in random.Random(7).sample(items, 25):
        print('  [%s/%s] %s -> %s  | %s' % (it['template'], it['difficulty'], it['q'], it['correct'],
                                           ' / '.join(it['wrong'])))
    node_check()


if __name__ == '__main__':
    main()
