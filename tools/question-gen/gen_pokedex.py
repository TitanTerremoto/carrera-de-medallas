#!/usr/bin/env python3
"""Genera el banco de preguntas POKÉDEX (500 preguntas) a partir de los CSV de PokeAPI.

Uso (desde cualquier carpeta):
    python games/carrera-de-medallas/tools/question-gen/gen_pokedex.py

Solo usa la biblioteca estándar. Es determinista (semilla fija).
Escribe games/carrera-de-medallas/questions-pokedex.js y valida el resultado.
"""
import csv
import json
import os
import random
import re
import sys
import unicodedata
from collections import Counter

SEED = 20261001
TOTAL = 500
ES = "7"  # local_language_id del español

HERE = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.normpath(os.path.join(HERE, "..", ".."))
DATA_DIR = os.path.join(GAME_DIR, "tools", "pokeapi-data")
OUT_PATH = os.path.join(GAME_DIR, "questions-pokedex.js")
EXISTING_PATH = os.path.join(GAME_DIR, "questions.js")

REGIONS = {1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Teselia",
           6: "Kalos", 7: "Alola", 8: "Galar", 9: "Paldea"}

# Cantidad de preguntas por plantilla (suma 500, ninguna supera el 25 %).
TEMPLATE_TARGETS = {
    "numero_de": 50,
    "quien_es_numero": 45,
    "altura": 40,
    "peso": 40,
    "mas_alto_bajo_que": 40,
    "mas_pesado_liviano_que": 40,
    "orden_antes_despues": 35,
    "genus_a_pokemon": 45,
    "pokemon_a_genus": 40,
    "region_de": 40,
    "misma_region": 25,
    "siguiente_anterior": 35,
    "color": 25,
}
# Sin nivel fácil: números, pesos y alturas con opciones cercanas que confunden.
DIFFICULTY_WEIGHTS = [("facil", 0), ("media", 55), ("dificil", 45)]
RANGE_WEIGHTS = [((1, 251), 55), ((252, 493), 30), ((494, 1025), 15)]
MAX_SUBJECT_USES = 3
MIN_GAP = 0.15  # separación mínima relativa entre valores de altura/peso


class GenError(Exception):
    pass


# ───────────────────────── datos ─────────────────────────

def read_csv(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_species():
    species = {}
    for r in read_csv("pokemon_species.csv"):
        sid = int(r["id"])
        if sid > 1025:
            continue
        species[sid] = {"id": sid, "gen": int(r["generation_id"]),
                        "color_id": int(r["color_id"])}
    for r in read_csv("pokemon.csv"):
        sid = int(r["species_id"])
        if r["is_default"] == "1" and sid in species:
            species[sid]["height"] = int(r["height"])  # decímetros
            species[sid]["weight"] = int(r["weight"])  # hectogramos
    for r in read_csv("pokemon_species_names.csv"):
        sid = int(r["pokemon_species_id"])
        if r["local_language_id"] == ES and sid in species:
            species[sid]["name"] = r["name"].strip()
            genus = r["genus"].strip()
            if genus.startswith("Pokémon "):
                genus = genus[len("Pokémon "):].strip()
            species[sid]["genus"] = genus or None
    colors = {int(r["pokemon_color_id"]): r["name"].strip()
              for r in read_csv("pokemon_color_names.csv") if r["local_language_id"] == ES}
    for s in species.values():
        s["color"] = colors[s["color_id"]]
        for k in ("name", "height", "weight"):
            if not s.get(k):
                raise GenError(f"Faltan datos ({k}) para la especie {s['id']}")
    if len(species) != 1025:
        raise GenError(f"Se esperaban 1025 especies, hay {len(species)}")
    return species, sorted(set(colors.values()))


def normalize(text):
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    for junk in ("segun la pokedex", "de la pokedex nacional", "en la pokedex nacional",
                 "en la pokedex"):
        t = t.replace(junk, "")
    t = re.sub(r"\(#?\d+\)", "", t)
    t = re.sub(r"#0*", "", t)
    t = re.sub(r"\b0+(\d)", r"\1", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def load_existing_questions():
    with open(EXISTING_PATH, encoding="utf-8") as f:
        src = f.read()
    start = src.find("pokedex: [")
    end = src.find("\n  ],", start)
    if start < 0 or end < 0:
        raise GenError("No se encontró la categoría pokedex en questions.js")
    block = src[start:end]
    qs = re.findall(r"q:\s*'((?:[^'\\]|\\.)*)'", block)
    if not qs:
        raise GenError("No se pudieron leer las preguntas existentes de pokedex")
    return {normalize(q) for q in qs}


# ───────────────────────── formato ─────────────────────────

def fmt_num(n):
    return f"#{n:03d}"


def fmt_dec(v):
    return f"{v // 10},{v % 10}"


def fmt_h(dm):
    return f"{fmt_dec(dm)} m"


def fmt_w(hg):
    return f"{fmt_dec(hg)} kg"


def apart(a, b, gap=MIN_GAP):
    return abs(a - b) / max(a, b) >= gap


# ───────────────────────── generador ─────────────────────────

class Generator:
    def __init__(self, species, color_names, existing):
        self.rng = random.Random(SEED)
        self.sp = species
        self.colors = color_names
        self.existing = existing
        self.seen = set()
        self.subject_uses = Counter()
        self.by_range = {rg: [s for s in species.values() if rg[0] <= s["id"] <= rg[1]]
                         for rg, _ in RANGE_WEIGHTS}
        self.by_gen = {}
        for s in species.values():
            self.by_gen.setdefault(s["gen"], []).append(s)
        genus_count = Counter(s["genus"] for s in species.values() if s["genus"])
        self.genus_count = genus_count

    # -- selección --
    def pick_range(self):
        rgs = [rg for rg, _ in RANGE_WEIGHTS]
        return self.rng.choices(rgs, weights=[w for _, w in RANGE_WEIGHTS])[0]

    def pick_species(self, pred=lambda s: True, subject=True):
        for _ in range(200):
            s = self.rng.choice(self.by_range[self.pick_range()])
            if subject and self.subject_uses[s["id"]] >= MAX_SUBJECT_USES:
                continue
            if pred(s):
                return s
        raise GenError("No se encontró especie que cumpla el filtro")

    def pick_difficulty(self):
        return self.rng.choices([d for d, _ in DIFFICULTY_WEIGHTS],
                                weights=[w for _, w in DIFFICULTY_WEIGHTS])[0]

    def pick_values(self, correct, candidates, n, gap):
        """Elige n valores distintos de candidates, separados de correct y entre sí."""
        cands = list(set(candidates))
        self.rng.shuffle(cands)
        chosen = []
        for v in cands:
            if v <= 0 or not apart(v, correct, gap):
                continue
            if all(apart(v, c, gap) for c in chosen):
                chosen.append(v)
                if len(chosen) == n:
                    return chosen
        raise GenError("Sin distractores suficientes")

    # -- plantillas --
    def t_numero_de(self, d):
        s = self.pick_species()
        n = s["id"]
        lo, hi = {"facil": (10, 80), "media": (3, 15), "dificil": (1, 3)}[d]
        offs = [o for o in range(-hi, hi + 1) if abs(o) >= lo and 1 <= n + o <= 1025]
        wrong = [n + o for o in self.rng.sample(offs, 3)]
        return s, {
            "q": f"¿Qué número tiene {s['name']} en la Pokédex Nacional?",
            "correct": fmt_num(n), "wrong": [fmt_num(w) for w in wrong],
            "explain": f"{s['name']} es el {fmt_num(n)} de la Pokédex Nacional "
                       f"y debutó en {REGIONS[s['gen']]}.",
        }

    def nearby_species(self, n, d, exclude, k=3):
        lo, hi = {"facil": (5, 60), "media": (2, 12), "dificil": (1, 3)}[d]
        offs = [o for o in range(-hi, hi + 1)
                if abs(o) >= lo and 1 <= n + o <= 1025 and n + o not in exclude]
        return [self.sp[n + o] for o in self.rng.sample(offs, k)]

    def t_quien_es_numero(self, d):
        s = self.pick_species()
        n = s["id"]
        wrong = self.nearby_species(n, d, {n})
        expl = ", ".join(f"{w['name']} el {fmt_num(w['id'])}"
                         for w in sorted(wrong, key=lambda x: x["id"]))
        return s, {
            "q": f"¿Qué Pokémon ocupa el número {fmt_num(n)} de la Pokédex Nacional?",
            "correct": s["name"], "wrong": [w["name"] for w in wrong],
            "explain": f"{s['name']} es el {fmt_num(n)}; {expl}.",
        }

    def measure_options(self, value, d, allv):
        gap = {"facil": 0.40, "media": 0.25, "dificil": MIN_GAP}[d]
        lo, hi = {"facil": (0.15, 6), "media": (0.3, 3), "dificil": (0.5, 2)}[d]
        cands = [v for v in allv if lo * value <= v <= hi * value]
        # Valores "redondos" sintéticos por si hay pocos reales cerca.
        cands += [max(1, round(value * f)) for f in (0.3, 0.5, 0.7, 1.4, 2, 3)]
        return self.pick_values(value, cands, 3, gap)

    def t_altura(self, d):
        s = self.pick_species()
        allv = [x["height"] for x in self.sp.values()]
        wrong = self.measure_options(s["height"], d, allv)
        return s, {
            "q": f"¿Cuánto mide {s['name']}?",
            "correct": fmt_h(s["height"]), "wrong": [fmt_h(w) for w in wrong],
            "explain": f"Según la Pokédex, {s['name']} mide {fmt_h(s['height'])} "
                       f"y pesa {fmt_w(s['weight'])}.",
        }

    def t_peso(self, d):
        s = self.pick_species()
        allv = [x["weight"] for x in self.sp.values()]
        wrong = self.measure_options(s["weight"], d, allv)
        return s, {
            "q": f"¿Cuánto pesa {s['name']}?",
            "correct": fmt_w(s["weight"]), "wrong": [fmt_w(w) for w in wrong],
            "explain": f"Según la Pokédex, {s['name']} pesa {fmt_w(s['weight'])} "
                       f"y mide {fmt_h(s['height'])}.",
        }

    def relative(self, d, key, more_word, less_word, fmt, verb):
        ref = self.pick_species()
        more = self.rng.random() < 0.5
        gap = {"facil": 0.45, "media": 0.25, "dificil": MIN_GAP}[d]
        rv = ref[key]

        def is_more(s):
            return s[key] > rv and apart(s[key], rv, gap)

        def is_less(s):
            return s[key] < rv and apart(s[key], rv, gap)

        good, bad = (is_more, is_less) if more else (is_less, is_more)
        ans = self.pick_species(lambda s: s["id"] != ref["id"] and good(s), subject=False)
        wrong = []
        for _ in range(300):
            w = self.pick_species(lambda s: s["id"] != ref["id"] and bad(s), subject=False)
            vals = [ans[key]] + [x[key] for x in wrong]
            if w["id"] not in {x["id"] for x in wrong} and all(apart(w[key], v) for v in vals):
                wrong.append(w)
                if len(wrong) == 3:
                    break
        if len(wrong) < 3:
            raise GenError("Sin distractores para comparación")
        word = more_word if more else less_word
        opts = sorted([ans] + wrong, key=lambda s: -s[key])
        listing = ", ".join(f"{s['name']} {fmt(s[key])}" for s in opts)
        return ref, {
            "q": f"¿Cuál de estos Pokémon es {word} que {ref['name']}?",
            "correct": ans["name"], "wrong": [w["name"] for w in wrong],
            "explain": f"{ref['name']} {verb} {fmt(rv)}; {listing}.",
        }

    def t_mas_alto_bajo_que(self, d):
        return self.relative(d, "height", "más alto", "más bajo", fmt_h, "mide")

    def t_mas_pesado_liviano_que(self, d):
        return self.relative(d, "weight", "más pesado", "más liviano", fmt_w, "pesa")

    def t_orden_antes_despues(self, d):
        ref = self.pick_species(lambda s: 20 <= s["id"] <= 1005)
        n = ref["id"]
        before = self.rng.random() < 0.5
        span = {"facil": 120, "media": 40, "dificil": 12}[d]
        lo_ids = [i for i in range(max(1, n - span), n)]
        hi_ids = [i for i in range(n + 1, min(1025, n + span) + 1)]
        good_ids, bad_ids = (lo_ids, hi_ids) if before else (hi_ids, lo_ids)
        if len(good_ids) < 1 or len(bad_ids) < 3:
            raise GenError("Rango insuficiente")
        ans = self.sp[self.rng.choice(good_ids)]
        wrong = [self.sp[i] for i in self.rng.sample(bad_ids, 3)]
        word = "antes" if before else "después"
        opts = sorted([ans] + wrong, key=lambda s: s["id"])
        listing = ", ".join(f"{s['name']} {fmt_num(s['id'])}" for s in opts)
        return ref, {
            "q": f"¿Cuál de estos Pokémon aparece {word} que {ref['name']} en la Pokédex Nacional?",
            "correct": ans["name"], "wrong": [w["name"] for w in wrong],
            "explain": f"{ref['name']} es el {fmt_num(n)}; {listing}.",
        }

    def t_genus_a_pokemon(self, d):
        s = self.pick_species(lambda s: s["genus"] and self.genus_count[s["genus"]] <= 2)
        g = s["genus"]
        pool = self.by_gen[s["gen"]] if d != "facil" else list(self.sp.values())
        cands = [x for x in pool if x["id"] != s["id"] and x["genus"] != g]
        if d == "facil":
            cands = [x for x in cands if x["id"] <= 493] or cands
        wrong = self.rng.sample(cands, 3)
        return s, {
            "q": f"¿Qué Pokémon es conocido como el Pokémon «{g}»?",
            "correct": s["name"], "wrong": [w["name"] for w in wrong],
            "explain": f"En la Pokédex, {s['name']} es el Pokémon {g}.",
        }

    def t_pokemon_a_genus(self, d):
        s = self.pick_species(lambda s: bool(s["genus"]))
        g = s["genus"]
        pool = self.by_gen[s["gen"]] if d != "facil" else list(self.sp.values())
        genera = sorted({x["genus"] for x in pool if x["genus"] and x["genus"] != g})
        wrong = self.rng.sample(genera, 3)
        return s, {
            "q": f"¿Cuál es la categoría de {s['name']} en la Pokédex?",
            "correct": f"Pokémon {g}", "wrong": [f"Pokémon {w}" for w in wrong],
            "explain": f"{s['name']} es el Pokémon {g}.",
        }

    def t_region_de(self, d):
        s = self.pick_species()
        others = [r for gid, r in REGIONS.items() if gid != s["gen"]]
        if d == "dificil":
            near = [REGIONS[g] for g in (s["gen"] - 2, s["gen"] - 1, s["gen"] + 1, s["gen"] + 2)
                    if g in REGIONS]
            wrong = self.rng.sample(near, min(3, len(near)))
            wrong += self.rng.sample([r for r in others if r not in wrong], 3 - len(wrong))
        else:
            wrong = self.rng.sample(others, 3)
        return s, {
            "q": f"¿En qué región debutó {s['name']}?",
            "correct": REGIONS[s["gen"]], "wrong": wrong,
            "explain": f"{s['name']} ({fmt_num(s['id'])}) debutó en la generación "
                       f"{s['gen']}, la de {REGIONS[s['gen']]}.",
        }

    def t_misma_region(self, d):
        ref = self.pick_species()
        ans = self.pick_species(lambda s: s["gen"] == ref["gen"] and s["id"] != ref["id"],
                                subject=False)
        wrong, gens = [], set()
        for _ in range(300):
            w = self.pick_species(lambda s: s["gen"] != ref["gen"], subject=False)
            if w["gen"] not in gens:
                gens.add(w["gen"])
                wrong.append(w)
                if len(wrong) == 3:
                    break
        if len(wrong) < 3:
            raise GenError("Sin distractores de región")
        listing = ", ".join(f"{w['name']} de {REGIONS[w['gen']]}" for w in wrong)
        return ref, {
            "q": f"¿Cuál de estos Pokémon debutó en la misma región que {ref['name']}?",
            "correct": ans["name"], "wrong": [w["name"] for w in wrong],
            "explain": f"{ref['name']} y {ans['name']} debutaron en {REGIONS[ref['gen']]}; "
                       f"{listing}.",
        }

    def t_siguiente_anterior(self, d):
        s = self.pick_species(lambda s: 3 <= s["id"] <= 1022)
        n = s["id"]
        after = self.rng.random() < 0.5
        target = n + 1 if after else n - 1
        word = "después" if after else "antes"
        pool = [n - 1 if after else n + 1, n + 2 if after else n - 2]
        far = {"facil": (5, 40), "media": (3, 10), "dificil": (2, 4)}[d]
        offs = [o for o in range(-far[1], far[1] + 1)
                if abs(o) >= far[0] and 1 <= n + o <= 1025 and n + o not in (n, target)]
        if d == "facil":
            wrong_ids = self.rng.sample(offs, 3)
            wrong_ids = [n + o for o in wrong_ids]
        else:
            wrong_ids = pool[:1] + [n + o for o in self.rng.sample(
                [o for o in offs if n + o not in pool], 2)]
        wrong = [self.sp[i] for i in wrong_ids]
        return s, {
            "q": f"¿Qué Pokémon viene justo {word} de {s['name']} en la Pokédex Nacional?",
            "correct": self.sp[target]["name"], "wrong": [w["name"] for w in wrong],
            "explain": f"{s['name']} es el {fmt_num(n)} y {self.sp[target]['name']} "
                       f"el {fmt_num(target)}.",
        }

    def t_color(self, d):
        s = self.pick_species(lambda s: s["id"] <= 493 or d != "facil")
        wrong = self.rng.sample([c for c in self.colors if c != s["color"]], 3)
        return s, {
            "q": f"¿De qué color es {s['name']} según la Pokédex?",
            "correct": s["color"], "wrong": wrong,
            "explain": f"La Pokédex clasifica a {s['name']} como de color {s['color'].lower()}.",
        }

    # -- bucle principal --
    def build(self):
        out = []
        tally = Counter()
        diff_tally = Counter()
        for tname, target in TEMPLATE_TARGETS.items():
            fn = getattr(self, "t_" + tname)
            made, attempts = 0, 0
            while made < target:
                attempts += 1
                if attempts > target * 200:
                    raise GenError(f"Plantilla {tname}: no se alcanzaron {target} preguntas")
                d = self.pick_difficulty()
                try:
                    subject, q = fn(d)
                except (GenError, ValueError):
                    continue
                key = normalize(q["q"])
                if q["q"] in self.seen or key in self.existing:
                    continue
                if self.subject_uses[subject["id"]] >= MAX_SUBJECT_USES:
                    continue
                if q["correct"] in q["q"] or q["correct"].lower() in q["q"].lower():
                    continue
                self.seen.add(q["q"])
                self.subject_uses[subject["id"]] += 1
                q["_template"], q["_difficulty"], q["_subject"] = tname, d, subject["id"]
                out.append(q)
                tally[tname] += 1
                diff_tally[d] += 1
                made += 1
        self.rng.shuffle(out)
        return out, tally, diff_tally


# ───────────────────────── validación ─────────────────────────

def validate(questions, species_by_name):
    if len(questions) != TOTAL:
        raise GenError(f"Se esperaban {TOTAL} preguntas, hay {len(questions)}")
    seen = set()
    for i, q in enumerate(questions):
        ctx = f"pregunta {i}: {q.get('q')!r}"
        for k in ("q", "correct", "explain"):
            if not isinstance(q.get(k), str) or not q[k].strip():
                raise GenError(f"{ctx}: campo {k} vacío")
        if not q["q"].startswith("¿") or not q["q"].endswith("?"):
            raise GenError(f"{ctx}: debe empezar con ¿ y terminar con ?")
        if not isinstance(q.get("wrong"), list) or len(q["wrong"]) != 3:
            raise GenError(f"{ctx}: necesita exactamente 3 incorrectas")
        opts = [q["correct"]] + q["wrong"]
        if any(not isinstance(o, str) or not o.strip() for o in opts):
            raise GenError(f"{ctx}: opción vacía")
        if len(set(opts)) != 4:
            raise GenError(f"{ctx}: opciones repetidas {opts}")
        if q["q"] in seen:
            raise GenError(f"{ctx}: pregunta duplicada")
        seen.add(q["q"])
        if q["correct"].lower() in q["q"].lower():
            raise GenError(f"{ctx}: la respuesta aparece en la pregunta")
        t = q["_template"]
        # Mismo tipo de opción.
        patterns = {
            "numero_de": r"^#\d{3,4}$", "altura": r"^\d+,\d m$", "peso": r"^\d+,\d kg$",
            "region_de": "^(" + "|".join(REGIONS.values()) + ")$",
            "pokemon_a_genus": r"^Pokémon .+$",
        }
        if t in patterns:
            for o in opts:
                if not re.match(patterns[t], o):
                    raise GenError(f"{ctx}: opción con formato inválido {o!r}")
        if t in ("altura", "peso"):
            vals = [int(o.split()[0].replace(",", "")) for o in opts]
            for a in range(4):
                for b in range(a + 1, 4):
                    if not apart(vals[a], vals[b]):
                        raise GenError(f"{ctx}: valores demasiado cercanos {opts}")
        name_templates = {"quien_es_numero", "mas_alto_bajo_que", "mas_pesado_liviano_que",
                          "orden_antes_despues", "genus_a_pokemon", "misma_region",
                          "siguiente_anterior"}
        if t in name_templates:
            for o in opts:
                if o not in species_by_name:
                    raise GenError(f"{ctx}: opción {o!r} no es un Pokémon")
        # Re-verificar que exactamente una opción cumple la condición.
        if t in ("mas_alto_bajo_que", "mas_pesado_liviano_que", "orden_antes_despues"):
            key = {"mas_alto_bajo_que": "height", "mas_pesado_liviano_que": "weight",
                   "orden_antes_despues": "id"}[t]
            ref = species_by_name[re.search(r"que (.+?)(?: en la Pokédex Nacional)?\?$",
                                            q["q"]).group(1)]
            more = any(w in q["q"] for w in ("más alto", "más pesado", "después"))
            ok = [o for o in opts
                  if (species_by_name[o][key] > ref[key]) == more
                  and species_by_name[o][key] != ref[key]]
            if ok != [q["correct"]]:
                raise GenError(f"{ctx}: la comparación no tiene una única respuesta {ok}")
            if t != "orden_antes_despues":
                vals = [species_by_name[o][key] for o in opts] + [ref[key]]
                if len(set(vals)) != 5:
                    raise GenError(f"{ctx}: empate en comparación")
        if t == "misma_region":
            ref = species_by_name[re.search(r"que (.+?)\?$", q["q"]).group(1)]
            ok = [o for o in opts if species_by_name[o]["gen"] == ref["gen"]]
            if ok != [q["correct"]]:
                raise GenError(f"{ctx}: más de una opción de la misma región")
        if t == "genus_a_pokemon":
            g = re.search(r"«(.+)»", q["q"]).group(1)
            ok = [o for o in opts if species_by_name[o]["genus"] == g]
            if ok != [q["correct"]]:
                raise GenError(f"{ctx}: categoría ambigua")


def main():
    species, colors = load_species()
    names = Counter(s["name"] for s in species.values())
    dup = [n for n, c in names.items() if c > 1]
    if dup:
        raise GenError(f"Nombres de especie repetidos: {dup}")
    by_name = {s["name"]: s for s in species.values()}
    existing = load_existing_questions()

    gen = Generator(species, colors, existing)
    questions, tally, diff_tally = gen.build()
    validate(questions, by_name)

    lines = [
        "/* Generado por tools/question-gen/gen_pokedex.py a partir de datos de PokeAPI. "
        "No editar a mano: volver a correr el generador. */",
        "window.QUESTION_BANK = window.QUESTION_BANK || {};",
        "window.QUESTION_BANK.pokedex = (window.QUESTION_BANK.pokedex || []).concat([",
    ]
    for q in questions:
        d = lambda v: json.dumps(v, ensure_ascii=False)
        lines.append(f"  {{ q: {d(q['q'])}, correct: {d(q['correct'])}, "
                     f"wrong: [{', '.join(d(w) for w in q['wrong'])}], "
                     f"explain: {d(q['explain'])} }},")
    lines.append("]);")
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    print(f"OK: {len(questions)} preguntas escritas en {OUT_PATH}")
    print("\nPor plantilla:")
    for t, c in tally.items():
        print(f"  {t:26s} {c:4d}  ({100 * c / TOTAL:.0f} %)")
    print("\nPor dificultad:", dict(diff_tally))
    rc = Counter()
    for q in questions:
        sid = q["_subject"]
        rc["1-251" if sid <= 251 else "252-493" if sid <= 493 else "494+"] += 1
    print("Por rango de especie (sujeto):", dict(rc))
    print("\nMuestras:")
    for q in random.Random(SEED + 1).sample(questions, 25):
        print(f"  [{q['_template']}/{q['_difficulty']}] {q['q']}")
        print(f"      ✔ {q['correct']}   ✘ {' | '.join(q['wrong'])}")
        print(f"      → {q['explain']}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except GenError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
