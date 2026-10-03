#!/usr/bin/env python3
"""Genera questions-habilidades.js (categoría HABILIDADES Y MOVIMIENTOS) a partir
de los CSV de PokeAPI en tools/pokeapi-data. Solo stdlib, determinista (semilla fija).

Uso (desde cualquier carpeta):
    python tools/question-gen/gen_habilidades.py
"""
import collections
import csv
import json
import os
import random
import re
import sys
import unicodedata

SEED = 20261001
ES = '7'  # language_id español (España)
TOTAL = 500

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.normpath(os.path.join(HERE, '..', '..'))
DATA = os.path.join(GAME_DIR, 'tools', 'pokeapi-data')
OUT = os.path.join(GAME_DIR, 'questions-habilidades.js')
EXISTING = os.path.join(GAME_DIR, 'questions.js')

# Cupos por plantilla (suman 500, ninguno > 25 %). Pocas preguntas fáciles
# («¿de qué tipo es Lanzallamas?», «¿cuál es más potente?») y más datos finos.
TARGETS = collections.OrderedDict([
    ('tipo_de_movimiento', 30),
    ('movimiento_de_tipo', 20),
    ('categoria', 40),
    ('potencia', 55),
    ('precision', 45),
    ('pp', 40),
    ('prioridad', 35),
    ('descripcion_movimiento', 65),
    ('descripcion_habilidad', 65),
    ('habilidad_de_pokemon', 55),
    ('habilidad_oculta', 35),
    ('mas_potente', 15),
])


# Pares cuyo efecto es casi idéntico aunque PokeAPI les dé effect_id distinto:
# nunca se usan como distractor el uno del otro en preguntas de descripción.
SIMILAR_MOVES = {frozenset(p) for p in [
    ('healing-wish', 'lunar-dance'), ('protect', 'detect'), ('protect', 'kings-shield'),
    ('protect', 'spiky-shield'), ('protect', 'baneful-bunker'), ('detect', 'spiky-shield'),
    ('self-destruct', 'explosion'), ('morning-sun', 'synthesis'), ('morning-sun', 'moonlight'),
    ('synthesis', 'moonlight'), ('recover', 'soft-boiled'), ('recover', 'milk-drink'),
    ('recover', 'slack-off'), ('recover', 'roost'), ('mean-look', 'block'),
    ('mean-look', 'spider-web'), ('block', 'spider-web'), ('whirlwind', 'roar'),
    ('perish-song', 'destiny-bond'), ('mimic', 'copycat'), ('mirror-move', 'copycat'),
]}


class GenError(Exception):
    pass


def fail(msg):
    raise GenError(msg)


def read(name):
    with open(os.path.join(DATA, name + '.csv'), encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def clean_text(t):
    t = t.replace('\u00ad\n', '').replace('\u00ad', '').replace('-\n', '-')
    t = re.sub(r'[\s\u000c]+', ' ', t)
    return t.strip()


STOP = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'al'}


def leaks(name, text):
    """True si el texto contiene el nombre o una raíz evidente de alguna de sus palabras."""
    nt = norm(text)
    nn = norm(name)
    if nn in nt:
        return True
    for w in re.findall(r'[a-z0-9]+', nn):
        if w in STOP or len(w) < 4:
            continue
        roots = {w[:5] if len(w) >= 5 else w}
        if len(w) >= 8:
            roots.add(w[-5:])
        if any(r in nt for r in roots):
            return True
    return False


# ---------------------------------------------------------------- datos

def load():
    d = {}
    type_name = {r['type_id']: r['name'] for r in read('type_names')
                 if r['local_language_id'] == ES}
    d['type_name'] = {int(k): v for k, v in type_name.items() if 1 <= int(k) <= 18}

    cat_name = {int(r['move_damage_class_id']): r['name'].capitalize()
                for r in read('move_damage_class_prose') if r['local_language_id'] == ES}
    d['cat_name'] = cat_name  # 1 Estado, 2 Físico, 3 Especial

    move_name = {int(r['move_id']): r['name'] for r in read('move_names')
                 if r['local_language_id'] == ES}

    # Texto de descripción: el version_group más reciente en español válido.
    flavor = {}
    for r in read('move_flavor_text'):
        if r['language_id'] != ES:
            continue
        t = clean_text(r['flavor_text'])
        if not t or 'no se puede usar' in t.lower() or 'dummy' in t.lower():
            continue
        mid, vg = int(r['move_id']), int(r['version_group_id'])
        if mid not in flavor or vg > flavor[mid][0]:
            flavor[mid] = (vg, t)

    moves = {}
    for r in read('moves'):
        mid = int(r['id'])
        if mid >= 10000 or int(r['generation_id']) > 7 or mid not in move_name:
            continue
        if r['pp'] in ('', '1'):  # Movimientos Z, Forcejeo y Esquema
            continue
        if not r['type_id'] or int(r['type_id']) not in d['type_name']:
            continue
        moves[mid] = {
            'id': mid,
            'name': move_name[mid],
            'gen': int(r['generation_id']),
            'type': int(r['type_id']),
            'power': int(r['power']) if r['power'] else None,
            'pp': int(r['pp']),
            'acc': int(r['accuracy']) if r['accuracy'] else None,
            'prio': int(r['priority']),
            'cat': int(r['damage_class_id']),
            'effect': r['effect_id'],
            'ident': r['identifier'],
            'flavor': flavor.get(mid, (None, None))[1],
        }
    names = collections.Counter(m['name'] for m in moves.values())
    for m in list(moves.values()):
        if names[m['name']] > 1:
            del moves[m['id']]
    d['moves'] = moves

    ab_name = {int(r['ability_id']): r['name'] for r in read('ability_names')
               if r['local_language_id'] == ES}
    ab_flavor = {}
    for r in read('ability_flavor_text'):
        if r['language_id'] != ES:
            continue
        t = clean_text(r['flavor_text'])
        if not t or 'dummy' in t.lower():
            continue
        aid, vg = int(r['ability_id']), int(r['version_group_id'])
        if aid not in ab_flavor or vg > ab_flavor[aid][0]:
            ab_flavor[aid] = (vg, t)
    abilities = {}
    for r in read('abilities'):
        aid = int(r['id'])
        if r['is_main_series'] != '1' or aid >= 10000 or aid not in ab_name:
            continue
        abilities[aid] = {'id': aid, 'name': ab_name[aid], 'gen': int(r['generation_id']),
                          'flavor': ab_flavor.get(aid, (None, None))[1]}
    d['abilities'] = abilities

    sp_name = {int(r['pokemon_species_id']): r['name'] for r in read('pokemon_species_names')
               if r['local_language_id'] == ES}
    pk_types = collections.defaultdict(list)
    for r in read('pokemon_types'):
        pk_types[int(r['pokemon_id'])].append(int(r['type_id']))
    pk_ab = collections.defaultdict(list)
    for r in read('pokemon_abilities'):
        aid = int(r['ability_id'])
        if aid in abilities:
            pk_ab[int(r['pokemon_id'])].append((aid, r['is_hidden'] == '1'))
    pokemon = {}
    for r in read('pokemon'):
        if r['is_default'] != '1':
            continue
        pid, sid = int(r['id']), int(r['species_id'])
        if sid not in sp_name or not pk_ab.get(pid):
            continue
        pokemon[pid] = {'id': pid, 'species': sid, 'name': sp_name[sid],
                        'types': pk_types[pid], 'abilities': pk_ab[pid]}
    d['pokemon'] = pokemon
    # Quién tiene cada habilidad (para explicaciones y distractores).
    holders = collections.defaultdict(list)
    for p in sorted(pokemon.values(), key=lambda p: p['species']):
        for aid, _ in p['abilities']:
            holders[aid].append(p)
    d['holders'] = holders
    return d


# ---------------------------------------------------------------- formato

def fmt_power(v):
    return str(v)


def fmt_acc(v):
    return 'No falla' if v is None else '%d %%' % v


def fmt_prio(v):
    return '+%d' % v if v > 0 else str(v)


def summary(d, m):
    parts = ['de tipo %s' % d['type_name'][m['type']],
             'categoría %s' % d['cat_name'][m['cat']]]
    if m['power']:
        parts.append('%d de potencia' % m['power'])
    return '%s es un movimiento %s.' % (m['name'], ', '.join(parts[:-1]) + ' y ' + parts[-1])


# ---------------------------------------------------------------- generador

class Gen:
    def __init__(self, d, existing_q):
        self.d = d
        self.rng = random.Random(SEED)
        self.used_q = set(existing_q)
        self.existing_q = set(existing_q)
        self.used_subject = set()
        self.moves = sorted(d['moves'].values(), key=lambda m: m['id'])
        self.known = [m for m in self.moves if m['gen'] <= 4]
        self.rest = [m for m in self.moves if m['gen'] > 4]

    # -- helpers
    def pick_move(self, pred, tag):
        for _ in range(400):
            pool = self.known if self.rng.random() < 0.6 else self.rest
            m = self.rng.choice(pool)
            if (tag, m['id']) in self.used_subject or not pred(m):
                continue
            return m
        return None

    def numeric_distractors(self, true, candidates, k=3, spread=None):
        cands = [c for c in candidates if c != true]
        if spread is not None:
            near = [c for c in cands if abs(c - true) <= spread]
            if len(near) >= k:
                cands = near
        cands.sort(key=lambda c: (abs(c - true), self.rng.random()))
        pool = cands[:max(k + 2, 5)]
        return self.rng.sample(pool, k)

    def difficulty(self, tpl, gen=None, species=None):
        if tpl in ('tipo_de_movimiento', 'movimiento_de_tipo', 'categoria'):
            return 'facil' if gen <= 4 else 'media'
        if tpl in ('mas_potente',):
            return 'facil'
        if tpl == 'descripcion_movimiento':
            return 'facil' if gen <= 3 else ('media' if gen <= 5 else 'dificil')
        if tpl == 'potencia':
            return 'facil' if gen == 1 else ('media' if gen <= 4 else 'dificil')
        if tpl == 'precision':
            return 'media' if gen <= 4 else 'dificil'
        if tpl == 'pp':
            return 'dificil'
        if tpl == 'prioridad':
            return 'media'
        if tpl == 'descripcion_habilidad':
            return 'facil' if gen == 3 else ('media' if gen <= 5 else 'dificil')
        if tpl == 'habilidad_de_pokemon':
            return 'facil' if species <= 493 else 'media'
        if tpl == 'habilidad_oculta':
            return 'media' if species <= 251 else 'dificil'
        return 'media'

    # -- plantillas: cada una devuelve dict o None
    def t_tipo_de_movimiento(self):
        m = self.pick_move(lambda m: True, 'tipo')
        if not m:
            return None
        others = [t for t in self.d['type_name'] if t != m['type']]
        wrong = [self.d['type_name'][t] for t in self.rng.sample(others, 3)]
        return dict(subject=('tipo', m['id']), gen=m['gen'],
                    q='¿De qué tipo es el movimiento %s?' % m['name'],
                    correct=self.d['type_name'][m['type']], wrong=wrong, explain=summary(self.d, m))

    def t_movimiento_de_tipo(self):
        t = self.rng.choice(list(self.d['type_name']))
        tn = self.d['type_name'][t]
        m = self.pick_move(lambda m: m['type'] == t, 'rev')
        if not m:
            return None
        wrong_m = []
        for _ in range(200):
            o = self.rng.choice(self.known if self.rng.random() < 0.6 else self.rest)
            if o['type'] != t and o not in wrong_m and o['name'] != m['name']:
                wrong_m.append(o)
            if len(wrong_m) == 3:
                break
        phr = self.rng.choice(['¿Cuál de estos movimientos es de tipo %s?',
                               '¿Qué movimiento de esta lista es de tipo %s?',
                               'Solo uno de estos movimientos es de tipo %s. ¿Cuál?'])
        expl = '%s es de tipo %s; %s.' % (m['name'], tn, ', '.join(
            '%s es %s' % (o['name'], self.d['type_name'][o['type']]) for o in wrong_m))
        return dict(subject=('rev', m['id']), gen=m['gen'], q=phr % tn, correct=m['name'],
                    wrong=[o['name'] for o in wrong_m], explain=expl,
                    check=lambda opt: self.by_name(opt)['type'] == t)

    def t_categoria(self):
        t = self.rng.choice(list(self.d['type_name']))
        c = self.rng.choice([1, 2, 3])
        same_t = [m for m in self.moves if m['type'] == t]
        m = self.pick_move(lambda m: m['type'] == t and m['cat'] == c, 'cat')
        others = [o for o in same_t if o['cat'] != c]
        if not m or len(others) < 3 or len({o['cat'] for o in others}) < 2:
            return None
        known_o = [o for o in others if o['gen'] <= 4]
        pool = known_o if len(known_o) >= 3 and self.rng.random() < 0.6 else others
        wrong_m = self.rng.sample(pool, 3)
        cn = self.d['cat_name'][c]
        q = '¿Cuál de estos movimientos de tipo %s es de categoría %s?' % (
            self.d['type_name'][t], cn)
        expl = '%s es %s; %s.' % (m['name'], cn.lower(), ', '.join(
            '%s es %s' % (o['name'], self.d['cat_name'][o['cat']].lower()) for o in wrong_m))
        return dict(subject=('cat', m['id']), gen=m['gen'], q=q, correct=m['name'],
                    wrong=[o['name'] for o in wrong_m], explain=expl,
                    check=lambda opt: self.by_name(opt)['cat'] == c)

    POWERS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
              110, 120, 130, 140, 150, 160, 180, 200, 250]

    def t_potencia(self):
        m = self.pick_move(lambda m: m['power'] and m['power'] >= 20, 'pow')
        if not m:
            return None
        wrong = self.numeric_distractors(m['power'], self.POWERS,
                                         spread=max(30, m['power'] // 2))
        q = self.rng.choice(['¿Qué potencia tiene %s?', '¿Qué potencia tiene el movimiento %s?'])
        return dict(subject=('pow', m['id']), gen=m['gen'], q=q % m['name'],
                    correct=fmt_power(m['power']), wrong=[fmt_power(w) for w in wrong],
                    explain=summary(self.d, m))

    ACCS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]

    def t_precision(self):
        # Precisión nula solo cuenta como "No falla" en movimientos de daño.
        m = self.pick_move(lambda m: m['acc'] is not None or m['cat'] != 1, 'acc')
        if not m:
            return None
        if m['acc'] is None:
            wrong = [fmt_acc(a) for a in self.rng.sample([90, 95, 100, 85], 3)]
        else:
            ws = self.numeric_distractors(m['acc'], self.ACCS, spread=20)
            wrong = [fmt_acc(a) for a in ws]
            if m['acc'] >= 90 and self.rng.random() < 0.3:
                wrong[-1] = 'No falla'
        acc_txt = ('nunca falla' if m['acc'] is None else 'tiene un %d %% de precisión' % m['acc'])
        expl = '%s %s (tipo %s).' % (m['name'], acc_txt, self.d['type_name'][m['type']])
        return dict(subject=('acc', m['id']), gen=m['gen'],
                    q='¿Qué precisión tiene %s?' % m['name'], correct=fmt_acc(m['acc']),
                    wrong=wrong, explain=expl)

    def t_pp(self):
        m = self.pick_move(lambda m: True, 'pp')
        if not m:
            return None
        wrong = self.numeric_distractors(m['pp'], [5, 10, 15, 20, 25, 30, 35, 40])
        q = self.rng.choice(['¿Cuántos PP tiene %s?', '¿Cuántos PP base tiene el movimiento %s?'])
        return dict(subject=('pp', m['id']), gen=m['gen'], q=q % m['name'], correct=str(m['pp']),
                    wrong=[str(w) for w in wrong],
                    explain='%s tiene %d PP base.' % (m['name'], m['pp']))

    def t_prioridad(self):
        kind = self.rng.random()
        if kind < 0.45:
            m = self.pick_move(lambda m: m['prio'] != 0, 'prio')
            if not m:
                return None
            wrong = self.numeric_distractors(m['prio'], list(range(-7, 6)), spread=3)
            return dict(subject=('prio', m['id']), gen=m['gen'],
                        q='¿Qué prioridad tiene %s?' % m['name'], correct=fmt_prio(m['prio']),
                        wrong=[fmt_prio(w) for w in wrong],
                        explain='%s tiene prioridad %s.' % (m['name'], fmt_prio(m['prio'])))
        sign = 1 if kind < 0.8 else -1
        t = self.rng.choice(list(self.d['type_name']))
        good = [m for m in self.moves if m['type'] == t and m['prio'] * sign > 0]
        bad = [m for m in self.moves if m['type'] == t and m['prio'] * sign <= 0 and m['prio'] == 0]
        if not good or len(bad) < 3:
            return None
        m = self.rng.choice(good)
        wrong_m = self.rng.sample(bad, 3)
        tn = self.d['type_name'][t]
        if sign > 0:
            q = self.rng.choice(['¿Cuál de estos movimientos de tipo %s tiene prioridad positiva?',
                                 '¿Qué movimiento de tipo %s suele atacar antes que el rival por su prioridad?'])
        else:
            q = self.rng.choice(['¿Cuál de estos movimientos de tipo %s tiene prioridad negativa?',
                                 '¿Qué movimiento de tipo %s suele actuar el último por su prioridad?'])
        expl = '%s tiene prioridad %s; los demás tienen prioridad 0.' % (m['name'], fmt_prio(m['prio']))
        return dict(subject=('prio2', t, sign, q), gen=m['gen'], q=q % tn, correct=m['name'],
                    wrong=[o['name'] for o in wrong_m], explain=expl,
                    check=lambda opt: self.by_name(opt)['prio'] * sign > 0)

    def unique_move_flavors(self):
        if not hasattr(self, '_umf'):
            c = collections.Counter(norm(m['flavor']) for m in self.moves if m['flavor'])
            self._umf = c
        return self._umf

    def t_descripcion_movimiento(self):
        cnt = self.unique_move_flavors()
        m = self.pick_move(lambda m: m['flavor'] and cnt[norm(m['flavor'])] == 1
                           and not leaks(m['name'], m['flavor'])
                           and len(m['flavor']) <= 170, 'desc')
        if not m:
            return None
        same = [o for o in self.moves if o['id'] != m['id'] and o['flavor']
                and norm(o['flavor']) != norm(m['flavor']) and o['effect'] != m['effect']
                and frozenset((o['ident'], m['ident'])) not in SIMILAR_MOVES
                and (o['type'] == m['type'] or o['cat'] == m['cat'])]
        same_t = [o for o in same if o['type'] == m['type']]
        pool = same_t if len(same_t) >= 3 else same
        wrong_m = self.rng.sample(pool, 3)
        q = '¿Qué movimiento hace esto: «%s»?' % m['flavor']
        return dict(subject=('desc', m['id']), gen=m['gen'], q=q, correct=m['name'],
                    wrong=[o['name'] for o in wrong_m], explain=summary(self.d, m),
                    leak=(m['name'], m['flavor']))

    def t_descripcion_habilidad(self):
        abs_ = sorted((a for a in self.d['abilities'].values() if a['gen'] <= 7),
                      key=lambda a: a['id'])
        cnt = collections.Counter(norm(a['flavor']) for a in abs_ if a['flavor'])
        ok = [a for a in abs_ if a['flavor'] and cnt[norm(a['flavor'])] == 1
              and self.d['holders'].get(a['id'])
              and not leaks(a['name'], a['flavor']) and ('ab', a['id']) not in self.used_subject]
        known = [a for a in ok if a['gen'] <= 4]
        pool = known if known and self.rng.random() < 0.6 else ok
        if not pool:
            return None
        a = self.rng.choice(pool)
        others = [o for o in abs_ if o['id'] != a['id'] and o['flavor']
                  and norm(o['flavor']) != norm(a['flavor']) and self.d['holders'].get(o['id'])]
        wrong = self.rng.sample(others, 3)
        holder = self.d['holders'][a['id']][0]['name']
        q = self.rng.choice(['¿Qué habilidad tiene este efecto: «%s»?',
                             '¿Qué habilidad se describe así: «%s»?'])
        return dict(subject=('ab', a['id']), gen=a['gen'], q=q % a['flavor'], correct=a['name'],
                    wrong=[o['name'] for o in wrong], leak=(a['name'], a['flavor']),
                    explain='Es %s, una habilidad que tiene, por ejemplo, %s.' % (a['name'], holder))

    def pick_pokemon(self, pred, tag):
        buckets = [(0.55, 1, 251), (0.30, 252, 493), (0.15, 494, 809)]
        pks = sorted(self.d['pokemon'].values(), key=lambda p: p['id'])
        for _ in range(400):
            r, acc = self.rng.random(), 0
            for w, lo, hi in buckets:
                acc += w
                if r < acc:
                    break
            pool = [p for p in pks if lo <= p['species'] <= hi]
            p = self.rng.choice(pool)
            if (tag, p['id']) in self.used_subject or not pred(p):
                continue
            return p
        return None

    def ability_distractors(self, p, k, exclude=()):
        own = {aid for aid, _ in p['abilities']}
        cands = set()
        for o in self.d['pokemon'].values():
            if o['id'] != p['id'] and set(o['types']) & set(p['types']):
                cands.update(aid for aid, _ in o['abilities']
                             if self.d['abilities'][aid]['gen'] <= 7)
        cands -= own
        cands -= set(exclude)
        cands = sorted(cands)
        return [self.d['abilities'][a]['name'] for a in self.rng.sample(cands, k)]

    def t_habilidad_de_pokemon(self):
        p = self.pick_pokemon(lambda p: True, 'hp')
        if not p:
            return None
        aid, hidden = self.rng.choice(p['abilities'])
        ab = self.d['abilities'][aid]['name']
        wrong = self.ability_distractors(p, 3)
        all_ab = sorted({self.d['abilities'][a]['name'] for a, _ in p['abilities']})
        expl = '%s puede tener: %s.' % (p['name'], ', '.join(all_ab))
        own_names = set(all_ab)
        return dict(subject=('hp', p['id']), species=p['species'],
                    q='¿Cuál de estas es una habilidad de %s?' % p['name'], correct=ab,
                    wrong=wrong, explain=expl, check=lambda opt: opt in own_names)

    def t_habilidad_oculta(self):
        def has_hidden(p):
            hid = [a for a, h in p['abilities'] if h]
            reg = [a for a, h in p['abilities'] if not h]
            return len(hid) == 1 and hid[0] not in reg
        p = self.pick_pokemon(has_hidden, 'ho')
        if not p:
            return None
        hid = [a for a, h in p['abilities'] if h][0]
        reg = sorted({a for a, h in p['abilities'] if not h})
        wrong = [self.d['abilities'][a]['name'] for a in reg]
        wrong += self.ability_distractors(p, 3 - len(wrong))
        hn = self.d['abilities'][hid]['name']
        reg_n = ' y '.join(self.d['abilities'][a]['name'] for a in reg)
        expl = 'La habilidad oculta de %s es %s; la normal es %s.' % (p['name'], hn, reg_n) \
            if len(reg) == 1 else \
            'La habilidad oculta de %s es %s; las normales son %s.' % (p['name'], hn, reg_n)
        return dict(subject=('ho', p['id']), species=p['species'],
                    q='¿Cuál es la habilidad oculta de %s?' % p['name'], correct=hn,
                    wrong=wrong, explain=expl, check=lambda opt: opt == hn)

    def t_mas_potente(self):
        t = self.rng.choice(list(self.d['type_name']))
        dmg = [m for m in self.moves if m['type'] == t and m['power'] and m['power'] >= 20]
        known = [m for m in dmg if m['gen'] <= 4]
        pool = known if len(known) >= 6 and self.rng.random() < 0.7 else dmg
        by_power = {}
        for m in pool:
            by_power.setdefault(m['power'], []).append(m)
        if len(by_power) < 4:
            return None
        powers = self.rng.sample(sorted(by_power), 4)
        ms = [self.rng.choice(by_power[pw]) for pw in powers]
        ms.sort(key=lambda m: -m['power'])
        best = ms[0]
        tn = self.d['type_name'][t]
        q = self.rng.choice(['¿Cuál de estos movimientos de tipo %s es el más potente?',
                             '¿Qué movimiento de tipo %s de esta lista tiene más potencia?'])
        expl = 'Potencias: ' + ', '.join('%s %d' % (m['name'], m['power']) for m in ms) + '.'
        maxp = best['power']
        return dict(subject=('mp', t, q), gen=best['gen'], q=q % tn, correct=best['name'],
                    wrong=[m['name'] for m in ms[1:]], explain=expl,
                    check=lambda opt: self.by_name(opt)['power'] == maxp)

    def by_name(self, name):
        if not hasattr(self, '_bn'):
            self._bn = {m['name']: m for m in self.moves}
        return self._bn[name]

    # -- validación de una pregunta concreta
    def valid(self, tpl, c):
        opts = [c['correct']] + c['wrong']
        if len(c['wrong']) != 3 or len(set(opts)) != 4:
            return False
        if any(not isinstance(o, str) or not o.strip() for o in opts + [c['q'], c['explain']]):
            return False
        if c['q'] in self.used_q:
            return False
        if 'check' in c and [o for o in opts if c['check'](o)] != [c['correct']]:
            fail('Respuesta no única en %s: %r' % (tpl, c['q']))
        if 'leak' in c and (leaks(*c['leak']) or c['leak'][1] not in c['q']):
            fail('Fuga del nombre en %s: %r' % (tpl, c['q']))
        # La respuesta nunca aparece literal en la pregunta.
        if re.search(r'(?<![\w+-])' + re.escape(norm(c['correct'])) + r'(?![\w%])', norm(c['q'])):
            return False
        return True

    def run(self):
        out = []
        stats = collections.Counter()
        diff = collections.Counter()
        for tpl, n in TARGETS.items():
            fn = getattr(self, 't_' + tpl)
            got, tries = 0, 0
            while got < n:
                tries += 1
                if tries > 20000:
                    fail('No se pudieron generar %d preguntas para %s (solo %d)' % (n, tpl, got))
                c = fn()
                if c is None or c['subject'] in self.used_subject or not self.valid(tpl, c):
                    continue
                self.used_subject.add(c['subject'])
                self.used_q.add(c['q'])
                wrong = list(c['wrong'])
                self.rng.shuffle(wrong)
                out.append({'q': c['q'], 'correct': c['correct'], 'wrong': wrong,
                            'explain': c['explain'], '_tpl': tpl})
                diff[self.difficulty(tpl, c.get('gen'), c.get('species'))] += 1
                got += 1
            stats[tpl] = got
        self.rng.shuffle(out)
        return out, stats, diff


def existing_questions():
    with open(EXISTING, encoding='utf-8') as f:
        src = f.read()
    return set(re.findall(r"q:\s*'((?:[^'\\]|\\.)*)'", src))


def validate_all(qs, existing):
    if len(qs) != TOTAL:
        fail('Se esperaban %d preguntas, hay %d' % (TOTAL, len(qs)))
    seen = set()
    for x in qs:
        if set(x) != {'q', 'correct', 'wrong', 'explain', '_tpl'}:
            fail('Estructura inválida: %r' % x)
        opts = [x['correct']] + x['wrong']
        if len(x['wrong']) != 3 or len(set(opts)) != 4:
            fail('Opciones inválidas: %r' % x)
        if any(not s.strip() for s in opts + [x['q'], x['explain']]):
            fail('Cadena vacía: %r' % x)
        if x['q'] in seen or x['q'] in existing:
            fail('Pregunta duplicada: %r' % x['q'])
        if not x['q'].startswith('¿') and '¿' not in x['q']:
            fail('Sin signo de interrogación: %r' % x['q'])
        seen.add(x['q'])
    counts = collections.Counter(x['_tpl'] for x in qs)
    if len(counts) < 8 or max(counts.values()) > TOTAL * 0.25:
        fail('Variedad insuficiente: %r' % counts)


def write_js(qs):
    lines = [
        '/* Generado por tools/question-gen/gen_habilidades.py a partir de datos de PokeAPI. '
        'No editar a mano: volver a correr el generador. */',
        'window.QUESTION_BANK = window.QUESTION_BANK || {};',
        'window.QUESTION_BANK.habilidades = (window.QUESTION_BANK.habilidades || []).concat([',
    ]
    for x in qs:
        j = lambda s: json.dumps(s, ensure_ascii=False)
        lines.append('  { q: %s, correct: %s, wrong: [%s], explain: %s },' % (
            j(x['q']), j(x['correct']), ', '.join(j(w) for w in x['wrong']), j(x['explain'])))
    lines.append(']);')
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    d = load()
    existing = existing_questions()
    qs, stats, diff = Gen(d, existing).run()
    validate_all(qs, existing)
    write_js(qs)
    print('Escritas %d preguntas en %s' % (len(qs), OUT))
    print('\nPor plantilla:')
    for tpl, n in stats.items():
        print('  %-24s %3d (%.0f %%)' % (tpl, n, 100.0 * n / TOTAL))
    print('\nDificultad estimada:', dict(diff))
    print('\nMuestras:')
    for x in random.Random(SEED + 1).sample(qs, 25):
        print('- [%s] %s\n    -> %s   (incorrectas: %s)' % (
            x['_tpl'], x['q'], x['correct'], ' | '.join(x['wrong'])))


if __name__ == '__main__':
    try:
        main()
    except GenError as e:
        print('ERROR:', e, file=sys.stderr)
        sys.exit(1)
