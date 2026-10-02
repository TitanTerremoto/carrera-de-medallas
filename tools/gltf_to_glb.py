"""Convierte un .gltf de Cobblemon (todo embebido en base64) a un .glb liviano.

Los modelos de Cobblemon (Blockbench) traen decenas de animaciones (dormir,
desmayarse, pruebas…) y todo en base64. El juego usa solo unas pocas. Este
script:
  1. deja solo las animaciones pedidas (por el final del nombre: «.ground_idle»);
  2. descarta los datos que ya nadie usa;
  3. lo guarda como .glb binario (mismo modelo y texturas).

Uso:
  python tools/gltf_to_glb.py tools/models-src/pikachu.gltf --keep ground_idle,ground_run,cry --out models
  (los .gltf originales quedan en tools/models-src/, que no se publica)
"""
import argparse
import base64
import json
import os
import struct


def decode_uri(uri):
    if not uri.startswith('data:'):
        raise ValueError('solo se admiten recursos embebidos (data:)')
    header, data = uri.split(',', 1)
    return base64.b64decode(data), header[5:].split(';')[0]


def pad(data, fill):
    return data + fill * ((4 - len(data) % 4) % 4)


def used_accessors(gltf):
    used = set()
    for mesh in gltf.get('meshes', []):
        for prim in mesh['primitives']:
            used.update(prim['attributes'].values())
            if 'indices' in prim:
                used.add(prim['indices'])
            for target in prim.get('targets', []):
                used.update(target.values())
    for skin in gltf.get('skins', []):
        if 'inverseBindMatrices' in skin:
            used.add(skin['inverseBindMatrices'])
    for anim in gltf.get('animations', []):
        for sampler in anim['samplers']:
            used.update((sampler['input'], sampler['output']))
    return used


def convert(src, keep, out_dir=None):
    gltf = json.load(open(src, encoding='utf-8'))
    buffers = [decode_uri(b['uri'])[0] for b in gltf.get('buffers', [])]

    if keep:
        gltf['animations'] = [a for a in gltf.get('animations', []) if any(a.get('name', '').endswith('.' + k) for k in keep)]

    # Accesores usados → índices nuevos.
    used = sorted(used_accessors(gltf))
    acc_map = {old: new for new, old in enumerate(used)}
    accessors = [gltf['accessors'][i] for i in used]

    def remap(i):
        return acc_map[i]

    for mesh in gltf.get('meshes', []):
        for prim in mesh['primitives']:
            prim['attributes'] = {k: remap(v) for k, v in prim['attributes'].items()}
            if 'indices' in prim:
                prim['indices'] = remap(prim['indices'])
            prim['targets'] = [{k: remap(v) for k, v in t.items()} for t in prim.get('targets', [])] or None
            if prim['targets'] is None:
                del prim['targets']
    for skin in gltf.get('skins', []):
        if 'inverseBindMatrices' in skin:
            skin['inverseBindMatrices'] = remap(skin['inverseBindMatrices'])
    for anim in gltf.get('animations', []):
        for sampler in anim['samplers']:
            sampler['input'] = remap(sampler['input'])
            sampler['output'] = remap(sampler['output'])

    # Vistas de buffer usadas, copiadas a un único binario.
    blob = bytearray()
    views = []
    view_map = {}

    def add_bytes(data, extra):
        nonlocal blob
        blob = bytearray(pad(bytes(blob), b'\0'))
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), **extra})
        blob += data
        return len(views) - 1

    for acc in accessors:
        old = acc.get('bufferView')
        if old is None:
            continue
        if old not in view_map:
            v = gltf['bufferViews'][old]
            start = v.get('byteOffset', 0)
            data = buffers[v.get('buffer', 0)][start : start + v['byteLength']]
            extra = {k: v[k] for k in ('byteStride', 'target') if k in v}
            view_map[old] = add_bytes(data, extra)
        acc['bufferView'] = view_map[old]
    gltf['accessors'] = accessors

    for image in gltf.get('images', []):
        if 'uri' in image:
            data, mime = decode_uri(image.pop('uri'))
        else:
            v = gltf['bufferViews'][image['bufferView']]
            start = v.get('byteOffset', 0)
            data, mime = buffers[v.get('buffer', 0)][start : start + v['byteLength']], image['mimeType']
        image['bufferView'] = add_bytes(data, {})
        image['mimeType'] = mime

    gltf['bufferViews'] = views
    blob = pad(bytes(blob), b'\0')
    gltf['buffers'] = [{'byteLength': len(blob)}]

    js = pad(json.dumps(gltf, separators=(',', ':')).encode('utf-8'), b' ')
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = src[: -len('.gltf')] + '.glb'
    if out_dir:
        out = os.path.join(out_dir, os.path.basename(out))
    with open(out, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0') + blob)
    return out, len(gltf.get('animations', [])), total


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--out', help='carpeta de salida (por defecto, junto al .gltf)')
    ap.add_argument('--keep', default='', help='animaciones a conservar, por sufijo, separadas por comas')
    args = ap.parse_args()
    keep = [k for k in args.keep.split(',') if k]
    for path in args.files:
        out, n, size = convert(path, keep, args.out)
        print(f'{path} -> {out}: {n} animaciones, {size // 1024} KB')
