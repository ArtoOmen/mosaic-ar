#!/usr/bin/env python3
"""Prepare a new picture for the living mosaic.

    python3 tools/prepare_target.py photo.jpg --id birds2 --title "Вторая мозаика"

Photo taken at an angle? Give the four outer corners of the frame (top-left, top-right,
bottom-right, bottom-left, in photo pixels) and the real width/height ratio; the picture is
straightened first:

    python3 tools/prepare_target.py side.jpg --id birds2 --corners 73,27,1424,212,1442,1533,70,1497 --aspect 0.92

Finds the mosaic on the photo, crops it, builds the mask, finds the birds' eyes and
sets up a rig (head turns, blinking, pupils, nests for the 3D birds). Writes
assets/t/<id>/{mural.jpg, mask.png, rig.json, photo.jpg, rig_preview.jpg} and adds
the picture to assets/targets.json. Afterwards rebuild assets/targets.mind with
tools/compile.html (button "Собрать все картинки").

Needs: pip install numpy opencv-python-headless
"""
import argparse
import json
import math
import os
import sys

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_SIDE = 1024        # texture / target size (long side)


def colorful_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1].astype(int), hsv[:, :, 2].astype(int)
    m = ((s > 70) | (v < 60)).astype(np.uint8)
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))


def find_mural(img):
    """Bounding box of the mosaic: the biggest blob of colourful / dark pixels."""
    h, w = img.shape[:2]
    m = colorful_mask(img)
    k = max(9, int(min(h, w) * 0.03)) | 1
    big = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(big)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, bw, bh = st[i, :4]
    pad = int(max(bw, bh) * 0.02)
    return max(0, x - pad), max(0, y - pad), min(w, x + bw + pad), min(h, y + bh + pad)


def build_mask(crop):
    h, w = crop.shape[:2]
    col = colorful_mask(crop)
    col = cv2.morphologyEx(col, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(col)
    panels = np.zeros((h, w), np.uint8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < h * w * 0.008:
            continue
        ys, xs = np.where(lab == i)
        cv2.fillConvexPoly(panels, cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32)), 1)
    ys, xs = np.where(panels > 0)
    outer = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(outer, cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32)), 255)
    d = max(5, int(w * 0.022)) | 1
    outer = cv2.dilate(outer, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d)))
    outer = cv2.GaussianBlur(outer.astype(np.float32), (0, 0), 4)
    flex = cv2.erode(panels * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(np.float32)
    flex = cv2.GaussianBlur(flex, (0, 0), 4)
    mask = np.zeros((h, w, 3), np.uint8)
    mask[:, :, 2] = np.clip(flex, 0, 255)       # R: may be warped
    mask[:, :, 1] = np.clip(outer, 0, 255)      # G: overlay alpha
    mask[:, :, 0] = panels * 255                 # B: mosaic (sparkles)
    return cv2.resize(mask, (w // 2, h // 2), interpolation=cv2.INTER_AREA)


def iris_like(hsv_px):
    h, s, v = hsv_px[..., 0].astype(int), hsv_px[..., 1].astype(int), hsv_px[..., 2].astype(int)
    yellow = (h >= 10) & (h <= 40) & (s >= 70) & (v >= 130)
    white = (s < 60) & (v >= 165)
    return yellow | white


def find_eyes(crop):
    """Dark round pupil inside a bright (yellow or white) round iris."""
    h, w = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    dark = (hsv[:, :, 2] < 85).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark)
    rmin, rmax = w * 0.0025, w * 0.016
    eyes = []
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA]
        rp = math.sqrt(area / math.pi)
        if not (rmin <= rp <= rmax):
            continue
        bw, bh = st[i, 2], st[i, 3]
        if not (0.6 <= bw / max(bh, 1) <= 1.6) or area < 0.55 * bw * bh:
            continue
        cx, cy = cen[i]
        # the ring right outside the pupil must be iris-coloured
        angs = np.linspace(0, 2 * np.pi, 32, endpoint=False)
        good, hues = 0, []
        for a in angs:
            for f in (1.45, 1.8):
                x, y = int(round(cx + math.cos(a) * rp * f)), int(round(cy + math.sin(a) * rp * f))
                if 0 <= x < w and 0 <= y < h:
                    px = hsv[y, x]
                    if iris_like(px[None, :])[0]:
                        good += 1
                        hues.append(int(px[0]))
        if good < 0.8 * len(angs) * 2:
            continue
        # iris radius: walk out along rays until the colour stops being iris-like
        radii = []
        for a in angs:
            r = rp * 1.3
            while r < rp * 4.5:
                x, y = int(round(cx + math.cos(a) * r)), int(round(cy + math.sin(a) * r))
                if not (0 <= x < w and 0 <= y < h) or not iris_like(hsv[y, x][None, :])[0]:
                    break
                r += 0.5
            radii.append(r)
        R = float(np.percentile(radii, 40)) + 0.8
        if not (1.5 <= R / rp <= 3.6):
            continue
        eyes.append({'c': [round(float(cx), 1), round(float(cy), 1)], 'R': round(R, 1), 'rp': round(rp, 1)})
    # drop duplicates / eyes inside other eyes
    eyes.sort(key=lambda e: -e['R'])
    out = []
    for e in eyes:
        if all(math.hypot(e['c'][0] - o['c'][0], e['c'][1] - o['c'][1]) > o['R'] * 1.2 for o in out):
            out.append(e)
    # eyelid colour: the head right above the eye (just outside the dark outline)
    for e in out:
        cx, cy, R = e['c'][0], e['c'][1], e['R']
        samples = []
        for a in np.radians(np.linspace(-150, -30, 13)):
            for f in (1.25, 1.4):
                x, y = int(round(cx + math.cos(a) * R * f)), int(round(cy + math.sin(a) * R * f))
                if 0 <= x < w and 0 <= y < h:
                    samples.append(crop[y, x][::-1])
        lid = np.median(np.array(samples), axis=0) if samples else np.array([30, 28, 30])
        # pale / bluish samples are background, not a head: fall back to the dark outline colour
        r, g, b = lid
        if (b > r + 10 and b > 90) or min(lid) > 150:
            lid = np.array([32, 30, 32])
        e['lid'] = lid.astype(int).tolist()
    return sorted(out, key=lambda e: (e['c'][1], e['c'][0]))


def pick_scheme(crop, x, y, R):
    """Colour scheme for the 3D bird from the painted bird's body under the eye."""
    h, w = crop.shape[:2]
    x0, x1 = int(max(0, x - 3 * R)), int(min(w, x + 3 * R))
    y0, y1 = int(max(0, y + 1.5 * R)), int(min(h, y + 6 * R))
    patch = cv2.cvtColor(crop[y0:y1, x0:x1], cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(int)
    if len(patch) == 0:
        return 0
    sat = patch[(patch[:, 1] > 80) & (patch[:, 2] > 60)]
    if len(sat) < len(patch) * 0.15:
        return 3                                   # mostly black / white bird
    hue = np.median(sat[:, 0])
    if hue < 10 or hue > 165:
        return 0                                   # red
    if hue < 35:
        return 1                                   # orange / yellow
    return 2                                       # blue / green


def build_rig(crop, eyes):
    h, w = crop.shape[:2]
    bones, nests, used = [], [], set()
    rig_eyes = []
    for i, e in enumerate(eyes):
        rig_eyes.append({'id': f'e{i}', 'c': e['c'], 'R': e['R'], 'lid': e['lid']})
    # pairs of eyes side by side are one face (owl): one slow head tilt
    for i, a in enumerate(eyes):
        for j, b in enumerate(eyes):
            if j <= i or i in used or j in used:
                continue
            dx, dy = abs(a['c'][0] - b['c'][0]), abs(a['c'][1] - b['c'][1])
            R = (a['R'] + b['R']) / 2
            if dx < R * 4.2 and dy < R * 1.2 and abs(a['R'] - b['R']) < R * 0.35:
                used.update((i, j))
                rig_eyes[i]['g'] = rig_eyes[j]['g'] = f'pair{i}'
                cx, cy = (a['c'][0] + b['c'][0]) / 2, (a['c'][1] + b['c'][1]) / 2
                bones.append({'t': 'owl', 'p': [round(cx), round(cy + R * 3.2)], 'c': [round(cx), round(cy - R * 0.2)],
                              'r': [round(dx / 2 + R * 2.6), round(R * 2.9)], 'a': 12})
                nests.append({'c': [round(cx), round(cy + R * 2.5)], 'scheme': 3})
    for i, e in enumerate(eyes):
        if i in used:
            continue
        x, y, R = e['c'][0], e['c'][1], e['R']
        bones.append({'t': 'head', 'p': [round(x), round(y + R * 3.0)], 'c': [round(x), round(y)],
                      'r': [round(R * 3.6), round(R * 2.4)], 'a': 12})
        bones.append({'t': 'breath', 'c': [round(x), round(y + R * 5.5)], 'r': [round(R * 4), round(R * 4)], 'a': 0.02})
        nests.append({'c': [round(x), round(y + R * 2.5)], 'scheme': pick_scheme(crop, x, y, R)})
    return {'w': w, 'h': h, 'eyes': rig_eyes, 'bones': bones, 'nests': nests}


def preview(crop, rig):
    vis = crop.copy()
    for b in rig['bones']:
        if b['t'] in ('head', 'owl'):
            cv2.ellipse(vis, tuple(b['c']), tuple(b['r']), 0, 0, 360, (0, 200, 255), 1)
            cv2.circle(vis, tuple(b['p']), 3, (0, 0, 255), -1)
    for e in rig['eyes']:
        cv2.circle(vis, (int(e['c'][0]), int(e['c'][1])), int(e['R']), (0, 255, 0), 2)
    for n in rig['nests']:
        cv2.drawMarker(vis, tuple(n['c']), (255, 0, 255), cv2.MARKER_CROSS, 14, 2)
    return vis


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photo')
    ap.add_argument('--id', required=True)
    ap.add_argument('--title', default='')
    ap.add_argument('--crop', help='x0,y0,x1,y1 in photo pixels (default: automatic)')
    ap.add_argument('--corners', help='TLx,TLy,TRx,TRy,BRx,BRy,BLx,BLy of the frame: straighten an angled photo')
    ap.add_argument('--aspect', type=float, default=0.92, help='real width / height of the frame (with --corners)')
    ap.add_argument('--no-manifest', action='store_true')
    a = ap.parse_args()

    img = cv2.imread(a.photo)
    if img is None:
        sys.exit('cannot read ' + a.photo)
    if max(img.shape[:2]) > 2400:
        s = 2400 / max(img.shape[:2])
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if a.corners:
        c = np.float32(list(map(float, a.corners.split(',')))).reshape(4, 2)
        bh = int(round(max(np.linalg.norm(c[3] - c[0]), np.linalg.norm(c[2] - c[1]))))
        bh = min(bh, MAX_SIDE - 24)
        bw = int(round(bh * a.aspect))
        m = 12                                   # keep a little wall around the frame
        dst = np.float32([(m, m), (m + bw, m), (m + bw, m + bh), (m, m + bh)])
        img = cv2.warpPerspective(img, cv2.getPerspectiveTransform(c, dst), (bw + 2 * m, bh + 2 * m),
                                  flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        a.crop = f'0,0,{bw + 2 * m},{bh + 2 * m}'
    x0, y0, x1, y1 = map(int, a.crop.split(',')) if a.crop else find_mural(img)
    crop = img[y0:y1, x0:x1]
    if max(crop.shape[:2]) > MAX_SIDE:
        s = MAX_SIDE / max(crop.shape[:2])
        crop = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)

    out = os.path.join(ROOT, 'assets', 't', a.id)
    os.makedirs(out, exist_ok=True)
    cv2.imwrite(os.path.join(out, 'mural.jpg'), crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(out, 'mask.png'), build_mask(crop))
    photo = img if max(img.shape[:2]) <= 1600 else cv2.resize(img, None, fx=1600 / max(img.shape[:2]), fy=1600 / max(img.shape[:2]), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(out, 'photo.jpg'), photo, [cv2.IMWRITE_JPEG_QUALITY, 86])
    eyes = find_eyes(crop)
    rig = build_rig(crop, eyes)
    with open(os.path.join(out, 'rig.json'), 'w') as f:
        json.dump(rig, f, ensure_ascii=False, indent=1)
    cv2.imwrite(os.path.join(out, 'rig_preview.jpg'), preview(crop, rig), [cv2.IMWRITE_JPEG_QUALITY, 85])

    if not a.no_manifest:
        mpath = os.path.join(ROOT, 'assets', 'targets.json')
        manifest = json.load(open(mpath)) if os.path.exists(mpath) else {'targets': []}
        manifest['targets'] = [t for t in manifest['targets'] if t['id'] != a.id]
        manifest['targets'].append({'id': a.id, 'title': a.title or a.id})
        with open(mpath, 'w') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f'{a.id}: crop {x0},{y0},{x1},{y1} -> {crop.shape[1]}x{crop.shape[0]}, '
          f'{len(eyes)} eyes, {len(rig["bones"])} bones, {len(rig["nests"])} nests -> {out}')


if __name__ == '__main__':
    main()
