#!/usr/bin/env python3
"""Genera questions-cambalache.js (categoría CAMBALACHE) a partir de los CSV de PokeAPI.

Uso (desde cualquier carpeta):
    python tools/question-gen/gen_cambalache.py

Solo biblioteca estándar. Determinista (semilla fija). Falla con AssertionError si
alguna validación no se cumple.
"""
import csv
import json
import os
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict

SEED = 20261001
TOTAL = 500
ES = '7'

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
DATA = os.path.join(GAME, 'tools', 'pokeapi-data')
OUT = os.path.join(GAME, 'questions-cambalache.js')
EXISTING = os.path.join(GAME, 'questions.js')

REGIONS = {1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: 'Teselia',
           6: 'Kalos', 7: 'Alola', 8: 'Galar', 9: 'Paldea'}

# Especies cuya generación en PokeAPI no coincide con la región de debut del mapa fijo:
# 808-809 (Meltan/Melmetal, Pokémon GO/Let's Go), 899-905 (Hisui, Leyendas: Arceus),
# 1011-1025 (DLC de Escarlata/Púrpura: Kitakami/Arándano).
REGION_UNSAFE = {808, 809} | set(range(899, 906)) | set(range(1011, 1026))
# Ultraentes y Pokémon paradoja: no se usan como distractores de "legendario/mítico".
UB_PARADOX = set(range(793, 800)) | set(range(803, 807)) | set(range(984, 996)) | \
    set(range(1005, 1011)) | set(range(1020, 1024))

# Plantillas y cuotas (suman 500; ninguna > 25 %).
QUOTAS = [
    ('evo_to', 60),
    ('evo_from', 55),
    ('level', 55),
    ('evo_item', 50),
    ('trade', 20),
    ('status', 52),       # legendario / mítico / bebé
    ('debut_region', 45),
    ('region_pick', 30),
    ('item_desc', 45),
    ('stages', 30),
    ('final_form', 33),
    ('habitat', 25),
]
# Dificultad heurística (solo informativa): base por plantilla + rango de la especie
# (1-251: +0, 252-493: +1, 494+: +2), acotada a 0 fácil / 1 media / 2 difícil.
BASE_DIFF = {'evo_to': 0, 'evo_from': 0, 'debut_region': 0, 'status': 0, 'final_form': 0,
             'region_pick': 0, 'evo_item': 0, 'trade': 0, 'item_desc': 0, 'stages': 1,
             'level': 1, 'habitat': 1}

rng = random.Random(SEED)


def read(name):
    with open(os.path.join(DATA, name), encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def fail(msg):
    raise AssertionError(msg)


def norm(s):
    s = unicodedata.normalize('NFKD', s.lower())
    return ''.join(c for c in s if not unicodedata.combining(c))


def clean_text(s):
    s = s.replace('­', '').replace('\x0c', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# ----------------------------------------------------------------------------- datos
species = {}
for r in read('pokemon_species.csv'):
    sid = int(r['id'])
    species[sid] = {
        'id': sid,
        'gen': int(r['generation_id']),
        'parent': int(r['evolves_from_species_id']) if r['evolves_from_species_id'] else None,
        'chain': int(r['evolution_chain_id']),
        'baby': r['is_baby'] == '1',
        'legendary': r['is_legendary'] == '1',
        'mythical': r['is_mythical'] == '1',
        'habitat': int(r['habitat_id']) if r['habitat_id'] else None,
    }

pname = {}
for r in read('pokemon_species_names.csv'):
    if r['local_language_id'] == ES and r['name'].strip():
        pname[int(r['pokemon_species_id'])] = r['name'].strip()
species = {k: v for k, v in species.items() if k in pname}

evo_rows = defaultdict(list)
for r in read('pokemon_evolution.csv'):
    evo_rows[int(r['evolved_species_id'])].append(r)


def _regional_row(r):
    return bool(r.get('region_id')) or bool(r.get('required_pokemon_form_id')) and         int(r['required_pokemon_form_id']) >= 10000


# Evoluciones que solo existen desde una forma regional (Meowth de Galar -> Perrserker,
# Mr. Mime de Galar -> Mr. Rime, Qwilfish de Hisui -> Overqwil...). La forma por defecto
# NO evoluciona así, de modo que se cortan del grafo: la especie evolucionada pasa a
# tratarse como raíz independiente y no se pregunta por ese enlace.
REGIONAL_ONLY = set()
for sid, s in species.items():
    if s['parent'] and evo_rows.get(sid) and all(_regional_row(r) for r in evo_rows[sid]):
        REGIONAL_ONLY.add(sid)
        s['parent'] = None

children = defaultdict(list)
for sid, s in species.items():
    if s['parent'] and s['parent'] in species:
        children[s['parent']].append(sid)
for k in children:
    children[k].sort()

chains = defaultdict(list)
for sid, s in species.items():
    chains[s['chain']].append(sid)

item_ident = {int(r['id']): r['identifier'] for r in read('items.csv')}
ident_item = {v: k for k, v in item_ident.items()}
iname = {}
for r in read('item_names.csv'):
    if r['local_language_id'] == ES and r['name'].strip():
        iname[int(r['item_id'])] = r['name'].strip()

idesc = {}
_best = {}
for r in read('item_flavor_text.csv'):
    if r['language_id'] != ES:
        continue
    iid, vg = int(r['item_id']), int(r['version_group_id'])
    if iid not in _best or vg > _best[iid]:
        _best[iid] = vg
        idesc[iid] = clean_text(r['flavor_text'])

hname = {}
for r in read('pokemon_habitat_names.csv'):
    if r['local_language_id'] == ES:
        hname[int(r['pokemon_habitat_id'])] = r['name'].strip()

COMPLEX_FIELDS = ['gender_id', 'location_id', 'time_of_day', 'known_move_id',
                  'known_move_type_id', 'minimum_happiness', 'minimum_beauty', 'minimum_affection',
                  'relative_physical_stats', 'party_species_id', 'party_type_id', 'trade_species_id',
                  'needs_overworld_rain', 'turn_upside_down', 'needs_multiplayer', 'near_special_rock',
                  'used_move_id', 'minimum_move_count', 'minimum_steps', 'minimum_damage_taken',
                  'nature_bitmask', 'condition_expression', 'percentage_chance']


def _is_form_row(r):
    """Filas de formas regionales/alternativas: no describen la forma por defecto."""
    if r.get('region_id'):
        return True
    for f in ('required_pokemon_form_id', 'evolved_pokemon_form_id'):
        if r.get(f) and int(r[f]) >= 10000:
            return True
    return False


def _row_sig(r):
    for f in COMPLEX_FIELDS:
        v = r.get(f, '')
        if v not in ('', '0'):
            return None
    trig = r['evolution_trigger_id']
    item = int(r['trigger_item_id']) if r['trigger_item_id'] else None
    held = int(r['held_item_id']) if r['held_item_id'] else None
    lvl = int(r['minimum_level']) if r['minimum_level'] else None
    if trig == '1' and lvl and not item and not held:
        return ('level', lvl)
    if trig == '3' and item and not held and not lvl and item in iname:
        return ('item', item)
    if trig == '2' and not item and not lvl:
        if held is None:
            return ('trade', None)
        if held in iname:
            return ('trade_held', held)
    return None


def simple_method(child):
    """Método único y simple con el que evoluciona `child` (forma por defecto), o None.

    Se exige que TODAS las filas de la forma por defecto, en todas las versiones, coincidan;
    si una versión usa ubicación/hora/amistad/etc., la especie se descarta."""
    rows = [r for r in evo_rows.get(child, []) if not _is_form_row(r)]
    if not rows:
        return None
    sigs = {_row_sig(r) for r in rows}
    if len(sigs) != 1:
        return None
    sig = sigs.pop()
    return sig


def evolves_by_trade_somewhere(sid):
    """True si algún hijo de sid tiene alguna fila de intercambio (o un objeto especial >=1000)."""
    for c in children.get(sid, []):
        for r in evo_rows.get(c, []):
            if r['evolution_trigger_id'] == '2':
                return True
            if r['trigger_item_id'] and int(r['trigger_item_id']) >= 1000:
                return True
    return False


def chain_has_trade(sid):
    return any(evolves_by_trade_somewhere(m) for m in chains[species[sid]['chain']])


def trade_child(sid):
    """Hijo de sid que evoluciona por intercambio en la fila por defecto (forma base)."""
    for c in children.get(sid, []):
        for r in evo_rows.get(c, []):
            if r['evolution_trigger_id'] == '2' and r['is_default'] == '1' and not _is_form_row(r):
                held = int(r['held_item_id']) if r['held_item_id'] else None
                partner = int(r['trade_species_id']) if r['trade_species_id'] else None
                return c, held, partner
    return None


def chain_info(chain_id):
    members = chains[chain_id]
    roots = [m for m in members if not species[m]['parent'] or species[m]['parent'] not in species]
    depth = {}

    def walk(n, d):
        depth[n] = d
        for c in children.get(n, []):
            walk(c, d + 1)
    for r in roots:
        walk(r, 1)
    leaves = [m for m in members if not children.get(m)]
    return roots, depth, leaves


def descendants(sid):
    out, stack = set(), list(children.get(sid, []))
    while stack:
        n = stack.pop()
        out.add(n)
        stack.extend(children.get(n, []))
    return out


def bucket(sid):
    return 0 if sid <= 251 else (1 if sid <= 493 else 2)


BUCKET_W = [0.55, 0.30, 0.15]


def weighted_order(cands, key=lambda x: x):
    """Ordena candidatos repartiendo los rangos de especie en proporción 55/30/15.

    Cada rango se baraja; luego se intercala eligiendo siempre el rango con mayor
    déficit respecto a su objetivo (mientras le queden candidatos)."""
    lists = defaultdict(list)
    for c in cands:
        lists[bucket(key(c))].append(c)
    for b in lists:
        rng.shuffle(lists[b])
    taken = Counter()
    out = []
    total = sum(len(v) for v in lists.values())
    for i in range(1, total + 1):
        live = [b for b in lists if lists[b]]
        b = max(live, key=lambda x: (BUCKET_W[x] * i - taken[x], -x))
        out.append(lists[b].pop())
        taken[b] += 1
    return out


def pick(pool, k, exclude=(), prefer=None):
    pool = sorted(set(pool) - set(exclude))
    if prefer:
        pref = [p for p in pool if prefer(p)]
        if len(pref) >= k:
            return rng.sample(pref, k)
        rest = [p for p in pool if p not in pref]
        if len(pref) + len(rest) < k:
            return None
        return pref + rng.sample(rest, k - len(pref))
    if len(pool) < k:
        return None
    return rng.sample(pool, k)


def near_gen(target_gen, spread=1):
    return lambda sid: abs(species[sid]['gen'] - target_gen) <= spread


def P(sid):
    return pname[sid]


def I(iid):
    return iname[iid]


# ----------------------------------------------------------------------------- preguntas existentes
existing_q = set()
with open(EXISTING, encoding='utf-8') as f:
    src = f.read()
for m in re.finditer(r"\bq:\s*'((?:\\.|[^'\\])*)'", src):
    existing_q.add(norm(m.group(1).replace("\\'", "'")))
for m in re.finditer(r'\bq:\s*"((?:\\.|[^"\\])*)"', src):
    existing_q.add(norm(m.group(1).replace('\\"', '"')))

questions = []
seen_q = set()


def add(tpl, q, correct, wrong, explain, sid=None, check=None, bump=0):
    """Valida y añade. Devuelve True si se añadió."""
    if norm(q) in seen_q or norm(q) in existing_q:
        return False
    opts = [correct] + list(wrong)
    if len(opts) != 4 or len({norm(o) for o in opts}) != 4 or any(not str(o).strip() for o in opts):
        return False
    if norm(correct) in norm(q):
        return False
    if check is not None and not check():
        fail('verificación de datos falló: ' + q)
    diff = BASE_DIFF[tpl] + bump + (0 if sid is None else bucket(sid))
    questions.append({'tpl': tpl, 'q': q, 'correct': correct, 'wrong': list(wrong),
                      'explain': explain, 'sid': sid, 'diff': min(diff, 2)})
    seen_q.add(norm(q))
    return True


# ----------------------------------------------------------------------------- generadores
evolved = [s for s in species if species[s]['parent'] in species]
has_children = [s for s in species if children.get(s)]


def gen_evo_to(n):
    out = 0
    for p in weighted_order(has_children):
        if out >= n:
            break
        ch = children[p]
        chain = set(chains[species[p]['chain']])
        c = ch[0] if len(ch) == 1 else rng.choice(ch)
        wrong = pick(evolved, 3, exclude=chain, prefer=near_gen(species[c]['gen']))
        if not wrong:
            continue
        if len(ch) == 1:
            q = f'¿En qué Pokémon evoluciona {P(p)}?'
            exp = f'{P(p)} evoluciona a {P(c)}.'
        else:
            q = f'¿Cuál de estos Pokémon es una evolución de {P(p)}?'
            exp = f'{P(c)} es una de las {len(ch)} evoluciones directas de {P(p)}.'
        ok = add('evo_to', q, P(c), [P(w) for w in wrong], exp, p,
                 check=lambda p=p, c=c, w=wrong: c in children[p] and
                 not any(x in descendants(p) for x in w))
        out += ok
    return out


def gen_evo_from(n):
    out = 0
    for p in weighted_order(evolved):
        if out >= n:
            break
        par = species[p]['parent']
        chain = set(chains[species[p]['chain']])
        wrong = pick(has_children, 3, exclude=chain, prefer=near_gen(species[par]['gen']))
        if not wrong:
            continue
        ok = add('evo_from', f'¿De qué Pokémon evoluciona {P(p)}?', P(par), [P(w) for w in wrong],
                 f'{P(p)} es la evolución de {P(par)}.', p,
                 check=lambda p=p, w=wrong: all(species[p]['parent'] != x for x in w))
        out += ok
    return out


def gen_level(n):
    cands = []
    for p in has_children:
        if len(children[p]) != 1:
            continue
        c = children[p][0]
        m = simple_method(c)
        if m and m[0] == 'level':
            cands.append(p)
    out = 0
    for p in weighted_order(cands):
        if out >= n:
            break
        c = children[p][0]
        lvl = simple_method(c)[1]
        pool = [x for x in range(max(2, lvl - 14), min(80, lvl + 14) + 1) if abs(x - lvl) >= 2]
        wrong = rng.sample(pool, 3)
        ok = add('level', f'¿A qué nivel evoluciona {P(p)}?', f'Nivel {lvl}',
                 [f'Nivel {x}' for x in wrong],
                 f'{P(p)} evoluciona a {P(c)} al alcanzar el nivel {lvl}.', p,
                 check=lambda c=c, lvl=lvl: simple_method(c) == ('level', lvl))
        out += ok
    return out


STONES = [ident_item[x] for x in ('fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone',
                                  'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone',
                                  'dawn-stone', 'ice-stone')]


def gen_evo_item(n):
    use_items, held_items, cands = set(), set(), []
    for p in has_children:
        for c in children[p]:
            m = simple_method(c)
            if not m:
                continue
            if m[0] == 'item':
                use_items.add(m[1])
                cands.append((p, c, m))
            elif m[0] == 'trade_held':
                held_items.add(m[1])
                cands.append((p, c, m))
    use_items |= set(STONES)
    out = 0
    for p, c, m in weighted_order(cands, key=lambda t: t[0]):
        if out >= n:
            break
        item = m[1]
        branched = len(children[p]) > 1
        tail = f' en {P(c)}' if branched else ''
        if m[0] == 'item':
            pool = STONES if item in STONES else sorted(use_items)
            wrong = pick(pool, 3, exclude=[item]) or pick(sorted(use_items), 3, exclude=[item])
            q = f'¿Qué objeto hace evolucionar a {P(p)}{tail}?'
            exp = f'{P(p)} evoluciona a {P(c)} si se le aplica {I(item)}.'
        else:
            wrong = pick(sorted(held_items), 3, exclude=[item])
            q = f'¿Qué objeto debe llevar {P(p)} al ser intercambiado para evolucionar{tail}?'
            exp = f'{P(p)} evoluciona a {P(c)} al ser intercambiado mientras lleva {I(item)}.'
        if not wrong:
            continue
        ok = add('evo_item', q, I(item), [I(w) for w in wrong], exp, p,
                 check=lambda c=c, m=m, w=wrong: simple_method(c) == m and m[1] not in w)
        out += ok
    return out


def region_ok(sid):
    return sid not in REGION_UNSAFE and species[sid]['gen'] in REGIONS


TRADE_PHRASES = [
    '¿Cuál de estos Pokémon de {R} evoluciona por intercambio?',
    'Entre estos Pokémon de {R}, ¿cuál evoluciona al ser intercambiado?',
    '¿Qué Pokémon de {R} necesita un intercambio para evolucionar?',
    '¿Cuál de estos Pokémon originarios de {R} evoluciona mediante intercambio?',
    '¿Cuál de estos Pokémon de {R} evoluciona cuando cambia de Entrenador?',
]


def gen_trade(n):
    cands = [s for s in has_children if region_ok(s) and trade_child(s)]
    non_trade = [s for s in has_children if region_ok(s) and not chain_has_trade(s)]
    used = defaultdict(int)
    out = 0
    for p in weighted_order(cands):
        if out >= n:
            break
        g = species[p]['gen']
        wrong = pick([s for s in non_trade if species[s]['gen'] == g], 3)
        if not wrong:
            continue
        c, held, partner = trade_child(p)
        for _ in range(len(TRADE_PHRASES)):
            q = TRADE_PHRASES[used[g] % len(TRADE_PHRASES)].format(R=REGIONS[g])
            used[g] += 1
            if norm(q) not in seen_q:
                break
        if held:
            exp = f'{P(p)} evoluciona a {P(c)} al ser intercambiado mientras lleva {I(held)}.'
        elif partner:
            exp = f'{P(p)} evoluciona a {P(c)} al intercambiarlo por {P(partner)}.'
        else:
            exp = f'{P(p)} evoluciona a {P(c)} al ser intercambiado.'
        ok = add('trade', q, P(p), [P(w) for w in wrong], exp, p,
                 check=lambda p=p, w=wrong: trade_child(p) is not None and
                 not any(evolves_by_trade_somewhere(x) for x in w) and
                 all(species[x]['gen'] == species[p]['gen'] for x in w))
        out += ok
    return out


STATUS = {
    'legendary': ('legendario', 'un Pokémon legendario'),
    'mythical': ('mítico', 'un Pokémon mítico (singular)'),
    'baby': ('un Pokémon bebé', 'un Pokémon bebé'),
}
STATUS_PHRASES = [
    '¿Cuál de estos Pokémon de {R} es {A}?',
    'Entre estos Pokémon de {R}, ¿cuál es {A}?',
    'De estos Pokémon originarios de {R}, ¿cuál es {A}?',
    '¿Qué Pokémon de {R}, de los siguientes, está catalogado como {A}?',
]


def flagged(s):
    return species[s]['legendary'] or species[s]['mythical'] or species[s]['baby']


def gen_status(n):
    plan = [('legendary', round(n * 0.5)), ('mythical', round(n * 0.27))]
    plan.append(('baby', n - sum(k for _, k in plan)))
    total = 0
    leftover = 0
    for flag, k in plan:
        k += leftover
        adj, _ = STATUS[flag]
        cands = [s for s in species if species[s][flag] and region_ok(s)]
        used = defaultdict(int)
        out = 0
        for p in weighted_order(cands):
            if out >= k:
                break
            g = species[p]['gen']
            if flag == 'baby':
                pool = [s for s in species if species[s]['gen'] == g and region_ok(s)
                        and not flagged(s) and not species[s]['parent'] and children.get(s)]
            else:
                pool = [s for s in species if species[s]['gen'] == g and region_ok(s)
                        and not flagged(s) and s not in UB_PARADOX and not children.get(s)
                        and species[s]['parent']]
            wrong = pick(pool, 3)
            if not wrong:
                continue
            q = None
            while used[g] < len(STATUS_PHRASES):
                cand = STATUS_PHRASES[used[g]].format(R=REGIONS[g], A=adj)
                used[g] += 1
                if norm(cand) not in seen_q:
                    q = cand
                    break
            if not q:
                continue
            label = {'legendary': 'un Pokémon legendario', 'mythical': 'un Pokémon mítico',
                     'baby': 'un Pokémon bebé'}[flag]
            exp = f'{P(p)} es {label} que debutó en {REGIONS[g]}.'
            ok = add('status', q, P(p), [P(w) for w in wrong], exp, p,
                     check=lambda p=p, w=wrong, flag=flag: species[p][flag] and
                     not any(species[x][flag] for x in w))
            out += ok
        leftover = k - out
        total += out
    return total


def region_options(g):
    others = [x for x in REGIONS if x != g]
    others.sort(key=lambda x: (abs(x - g) + rng.random() * 3))
    return others[:3]


def gen_debut_region(n):
    cands = [s for s in species if region_ok(s)]
    out = 0
    for p in weighted_order(cands):
        if out >= n:
            break
        g = species[p]['gen']
        wrong = region_options(g)
        ok = add('debut_region', f'¿En qué región debutó {P(p)}?', REGIONS[g],
                 [REGIONS[w] for w in wrong],
                 f'{P(p)} apareció por primera vez en la generación {g}, ambientada en {REGIONS[g]}.', p,
                 check=lambda p=p, w=wrong: species[p]['gen'] not in w)
        out += ok
    return out


REGION_PHRASES = [
    '¿Cuál de estos Pokémon debutó en {R}?',
    '¿Qué Pokémon de esta lista apareció por primera vez en {R}?',
    '¿Cuál de estos Pokémon es originario de {R}?',
    '¿Cuál de estos Pokémon se presentó en la región de {R}?',
]


def gen_region_pick(n):
    cands = [s for s in species if region_ok(s)]
    used = defaultdict(int)
    out = 0
    for p in weighted_order(cands):
        if out >= n:
            break
        g = species[p]['gen']
        if used[g] >= len(REGION_PHRASES):
            continue
        q = REGION_PHRASES[used[g]].format(R=REGIONS[g])
        used[g] += 1
        pool = [s for s in cands if species[s]['gen'] != g]
        wrong = pick(pool, 3, prefer=lambda s: abs(species[s]['gen'] - g) <= 2)
        ok = add('region_pick', q, P(p), [P(w) for w in wrong],
                 f'{P(p)} debutó en {REGIONS[g]} (generación {g}); los demás son de otras regiones.', p,
                 check=lambda p=p, w=wrong: all(species[x]['gen'] != species[p]['gen'] for x in w))
        out += ok
    return out


ITEM_GROUPS = {
    'ball': ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'safari-ball', 'net-ball',
             'dive-ball', 'nest-ball', 'repeat-ball', 'timer-ball', 'luxury-ball', 'premier-ball',
             'dusk-ball', 'heal-ball', 'quick-ball', 'lure-ball', 'level-ball', 'moon-ball',
             'heavy-ball', 'fast-ball', 'friend-ball', 'love-ball'],
    'medicine': ['potion', 'super-potion', 'hyper-potion', 'max-potion', 'full-restore', 'antidote',
                 'burn-heal', 'ice-heal', 'awakening', 'paralyze-heal', 'full-heal', 'revive',
                 'max-revive', 'ether', 'max-ether', 'elixir', 'max-elixir', 'rare-candy', 'hp-up',
                 'protein', 'iron', 'carbos', 'calcium', 'zinc', 'pp-up', 'fresh-water', 'soda-pop',
                 'lemonade', 'moomoo-milk', 'repel', 'super-repel', 'max-repel', 'escape-rope'],
    'stone': ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'sun-stone',
              'shiny-stone', 'dusk-stone', 'dawn-stone', 'ice-stone', 'oval-stone', 'everstone'],
    'berry': ['cheri-berry', 'chesto-berry', 'pecha-berry', 'rawst-berry', 'aspear-berry',
              'leppa-berry', 'oran-berry', 'persim-berry', 'lum-berry', 'sitrus-berry'],
    'held': ['leftovers', 'choice-band', 'choice-scarf', 'choice-specs', 'life-orb', 'focus-sash',
             'focus-band', 'lucky-egg', 'exp-share', 'soothe-bell', 'amulet-coin', 'quick-claw',
             'kings-rock', 'scope-lens', 'eviolite', 'assault-vest', 'rocky-helmet', 'black-sludge',
             'light-ball', 'expert-belt', 'muscle-band', 'wise-glasses', 'shell-bell', 'bright-powder',
             'white-herb', 'mental-herb', 'air-balloon', 'metal-coat', 'charcoal', 'mystic-water',
             'miracle-seed', 'magnet', 'never-melt-ice', 'dragon-scale', 'up-grade', 'dubious-disc',
             'protector', 'electirizer', 'magmarizer', 'reaper-cloth', 'prism-scale',
             'deep-sea-tooth', 'deep-sea-scale', 'razor-claw', 'razor-fang', 'sachet',
             'whipped-dream'],
}
GENERIC_WORDS = {'piedra', 'baya', 'ball', 'poke', 'objeto'}


def leaks(name, desc):
    d = norm(desc)
    if norm(name) in d:
        return True
    for w in re.findall(r'[a-z0-9]+', norm(name)):
        if w in GENERIC_WORDS:
            continue
        if len(w) >= 5 and w[:5] in d:
            return True
        if len(w) >= 3 and re.search(r'\b' + re.escape(w) + r'\b', d):
            return True
        for dw in re.findall(r'[a-z0-9]+', d):
            # «sol» insinúa «Solar»; «lunar» insinúa «Luna».
            if len(w) >= 4 and len(dw) >= 3 and (w.startswith(dw) or dw.startswith(w)):
                return True
    return False


def gen_item_desc(n):
    entries = []
    desc_count = Counter()
    for grp, idents in ITEM_GROUPS.items():
        for ident in idents:
            iid = ident_item.get(ident)
            if iid is None or iid not in iname or not idesc.get(iid):
                continue
            entries.append((grp, iid))
            desc_count[norm(idesc[iid])] += 1
    valid = [(g, i) for g, i in entries
             if desc_count[norm(idesc[i])] == 1 and not leaks(iname[i], idesc[i])]
    by_group = defaultdict(list)
    for g, i in entries:
        by_group[g].append(i)
    rng.shuffle(valid)
    # Reparto equilibrado entre grupos (round-robin).
    per_group = defaultdict(list)
    for g, i in valid:
        per_group[g].append(i)
    order = []
    while any(per_group.values()):
        for g in sorted(per_group):
            if per_group[g]:
                order.append((g, per_group[g].pop()))
    out = 0
    for g, iid in order:
        if out >= n:
            break
        # Ningún distractor puede tener su nombre "insinuado" por la descripción
        # (p. ej. «oscura como la noche» con Piedra Noche como opción).
        pool = [x for x in by_group[g] if not leaks(iname[x], idesc[iid])]
        wrong = pick(pool, 3, exclude=[iid])
        if not wrong:
            continue
        q = f'¿Qué objeto es este: «{idesc[iid]}»?'
        ok = add('item_desc', q, I(iid), [I(w) for w in wrong],
                 f'Es la descripción del objeto {I(iid)} en los juegos.', None,
                 bump=0 if g in ('ball', 'medicine', 'stone') else 1,
                 check=lambda iid=iid, w=wrong: all(norm(idesc.get(x, '')) != norm(idesc[iid]) for x in w))
        out += ok
    return out


def stage_word(k):
    return '1 etapa' if k == 1 else f'{k} etapas'


def gen_stages(n):
    picks = []
    for cid, members in chains.items():
        roots, depth, leaves = chain_info(cid)
        if len(roots) != 1:
            continue
        leaf_depths = {depth[l] for l in leaves}
        if len(leaf_depths) != 1:
            continue
        picks.append((rng.choice(sorted(members)), leaf_depths.pop(), roots[0]))
    picks.sort()
    singles_cap = max(1, n // 6)
    singles = 0
    out = 0
    for p, k, root in weighted_order(picks, key=lambda t: t[0]):
        if out >= n:
            break
        if k == 1:
            if singles >= singles_cap:
                continue
        wrong = [stage_word(x) for x in (1, 2, 3, 4) if x != k]
        if k == 1:
            exp = f'{P(p)} no evoluciona ni procede de otra especie, así que su línea tiene 1 etapa.'
        else:
            exp = f'La línea evolutiva de {P(p)} empieza en {P(root)} y tiene {k} etapas.'
        ok = add('stages', f'¿Cuántas etapas tiene la línea evolutiva de {P(p)}?', stage_word(k),
                 wrong, exp, p)
        if ok and k == 1:
            singles += 1
        out += ok
    return out


def gen_final_form(n):
    finals = []  # hojas de cadenas con evolución
    cands = []
    for cid, members in chains.items():
        roots, depth, leaves = chain_info(cid)
        if len(members) < 2:
            continue
        finals.extend(l for l in leaves if species[l]['parent'])
        if len(roots) == 1 and len(leaves) == 1:
            non_leaf = [m for m in members if m != leaves[0]]
            cands.append((rng.choice(sorted(non_leaf)), leaves[0], len(set(depth.values()))))
    cands.sort()
    # Preferir cadenas de 3 etapas: se ordenan primero.
    ordered = weighted_order(cands, key=lambda t: t[0])
    ordered.sort(key=lambda t: -min(t[2], 3))
    out = 0
    for p, leaf, k in ordered:
        if out >= n:
            break
        chain = set(chains[species[p]['chain']])
        wrong = pick(finals, 3, exclude=chain, prefer=near_gen(species[leaf]['gen']))
        if not wrong:
            continue
        ok = add('final_form', f'¿Cuál es la forma final de la línea evolutiva de {P(p)}?', P(leaf),
                 [P(w) for w in wrong], f'La línea evolutiva de {P(p)} termina en {P(leaf)}.', p,
                 check=lambda p=p, leaf=leaf, w=wrong: leaf in descendants(p) and not children.get(leaf)
                 and not any(x in chains[species[p]['chain']] for x in w))
        out += ok
    return out


CONFUSABLE_HAB = [{7, 9}, {3, 6}]  # mar / agua salada; pradera / campo


def gen_habitat(n):
    cands = [s for s in species if species[s]['habitat'] and species[s]['habitat'] != 5
             and species[s]['habitat'] in hname]
    habs = [h for h in hname if h != 5]
    out = 0
    for p in weighted_order(cands):
        if out >= n:
            break
        h = species[p]['habitat']
        excl = {h}
        for grp in CONFUSABLE_HAB:
            if h in grp:
                excl |= grp
        wrong = pick(habs, 3, exclude=excl)
        if not wrong:
            continue
        cap = lambda s: s[:1].upper() + s[1:]
        ok = add('habitat', f'¿En qué hábitat vive {P(p)} según la Pokédex?', cap(hname[h]),
                 [cap(hname[w]) for w in wrong],
                 f'La Pokédex clasifica el hábitat de {P(p)} como «{hname[h]}».', p,
                 check=lambda p=p, w=wrong: species[p]['habitat'] not in w)
        out += ok
    return out


GENS = {
    'evo_to': gen_evo_to, 'evo_from': gen_evo_from, 'level': gen_level, 'evo_item': gen_evo_item,
    'trade': gen_trade, 'status': gen_status, 'debut_region': gen_debut_region,
    'region_pick': gen_region_pick, 'item_desc': gen_item_desc, 'stages': gen_stages,
    'final_form': gen_final_form, 'habitat': gen_habitat,
}

# ----------------------------------------------------------------------------- ejecución
cap25 = TOTAL // 4
shortfall = 0
made = {}
for tpl, quota in QUOTAS:
    made[tpl] = GENS[tpl](quota)
    shortfall += quota - made[tpl]
# Rellenar el déficit con plantillas que tengan margen (sin superar el 25 %).
refill = ['evo_from', 'debut_region', 'evo_to', 'final_form', 'habitat', 'level', 'item_desc']
for tpl in refill:
    if shortfall <= 0:
        break
    room = cap25 - sum(1 for q in questions if q['tpl'] == tpl)
    want = min(room, shortfall)
    if want > 0:
        got = GENS[tpl](want)
        shortfall -= got

# ----------------------------------------------------------------------------- validación final
if len(questions) != TOTAL:
    fail(f'se esperaban {TOTAL} preguntas y hay {len(questions)}')
qs = [norm(x['q']) for x in questions]
if len(set(qs)) != len(qs):
    fail('preguntas duplicadas')
tpl_count = Counter(x['tpl'] for x in questions)
if len(tpl_count) < 8:
    fail('menos de 8 plantillas')
for t, c in tpl_count.items():
    if c > TOTAL * 0.25:
        fail(f'plantilla {t} supera el 25 %: {c}')
for x in questions:
    opts = [x['correct']] + x['wrong']
    if len(opts) != 4 or len({norm(o) for o in opts}) != 4:
        fail('opciones inválidas: ' + x['q'])
    for s in [x['q'], x['explain']] + opts:
        if not isinstance(s, str) or not s.strip():
            fail('cadena vacía en: ' + x['q'])
    if '¿' not in x['q'] or not x['q'].endswith('?'):
        fail('formato de pregunta: ' + x['q'])
    if norm(x['correct']) in norm(x['q']):
        fail('respuesta dentro de la pregunta: ' + x['q'])
    if norm(x['q']) in existing_q:
        fail('duplica questions.js: ' + x['q'])

rng.shuffle(questions)

# ----------------------------------------------------------------------------- salida
lines = [
    '/* Generado por tools/question-gen/gen_cambalache.py a partir de datos de PokeAPI. '
    'No editar a mano: volver a correr el generador. */',
    'window.QUESTION_BANK = window.QUESTION_BANK || {};',
    'window.QUESTION_BANK.cambalache = (window.QUESTION_BANK.cambalache || []).concat([',
]
J = lambda s: json.dumps(s, ensure_ascii=False)
body = []
for x in questions:
    body.append('  { q: %s, correct: %s, wrong: [%s], explain: %s }' % (
        J(x['q']), J(x['correct']), ', '.join(J(w) for w in x['wrong']), J(x['explain'])))
lines.append(',\n'.join(body))
lines.append(']);')
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines) + '\n')

# ----------------------------------------------------------------------------- informe
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:  # noqa: BLE001 - solo afecta a la consola
    pass
print(f'Escrito {OUT} con {len(questions)} preguntas.')
print('Por plantilla:')
for t, _ in QUOTAS:
    print(f'  {t:13s} {tpl_count[t]:4d}')
d = Counter(x['diff'] for x in questions)
print('Dificultad (heurística): fácil %d, media %d, difícil %d' % (d[0], d[1], d[2]))
b = Counter(bucket(x['sid']) for x in questions if x['sid'])
print('Especies por rango: 1-251 %d, 252-493 %d, 494+ %d' % (b[0], b[1], b[2]))
print('Muestras:')
for x in random.Random(SEED + 1).sample(questions, 25):
    print(f"  [{x['tpl']}] {x['q']}  -> {x['correct']}  (x {' | '.join(x['wrong'])})")
