#!/usr/bin/env python3
"""
retratos.py: de una foto a un dibujo de trazos (estilo estudio de leonardo, con aguada).

salida por edad en assets/retratos/:
  <edad>.json         lista de trazos [tipo, grosor, x0, y0, dx, dy, ...] (deltas enteros)
  <edad>.png          poster 1200px (papel + aguada + rayado)
  <edad>-aguada.webp  capa de color translucida (rgba, se compone con multiply)

uso: python3 tools/retratos.py [nino adolescente adulto viejo muerte]   (windows: py -3 tools\retratos.py ...)
las fotos de origen viven en _privado/ref/ y no se publican.
"""
import sys, json, os
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

W, H = 1200, 1500
TAU = 2 * np.pi
ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "_privado" / "ref"
OUT = ROOT / "assets" / "retratos"
MAXSTROKES = 8000
INK = np.array([0x1f, 0x3a, 0x6b], np.float32)       # bgr de #6b3a1f
INK_DARK = np.array([0x12, 0x25, 0x4d], np.float32)  # contornos
PAPER = np.array([196, 224, 236], np.float32)         # bgr crema


# ---------------------------------------------------------------- utilidades
def leer_bgr(ruta):
    """lee una imagen en bgr aunque la ruta tenga acentos (cv2.imread falla con ellos en windows)"""
    return cv2.imdecode(np.fromfile(str(ruta), np.uint8), cv2.IMREAD_COLOR)


def snoise(shape, sigma, seed):
    r = np.random.default_rng(seed).standard_normal(shape).astype(np.float32)
    r = cv2.GaussianBlur(r, (0, 0), sigma)
    return r / (r.std() + 1e-6)


def poly(pts, blur=0.0):
    m = np.zeros((H, W), np.float32)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1.0)
    if blur:
        m = cv2.GaussianBlur(m, (0, 0), blur)
    return m


def ell(c, ax, ang=0, blur=0.0):
    m = np.zeros((H, W), np.float32)
    cv2.ellipse(m, (int(c[0]), int(c[1])), (int(ax[0]), int(ax[1])), ang, 0, 360, 1.0, -1)
    if blur:
        m = cv2.GaussianBlur(m, (0, 0), blur)
    return m


def blob(c, r):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    return np.exp(-(((xx - c[0]) ** 2 + (yy - c[1]) ** 2) / (2 * r * r))).astype(np.float32)


# ---------------------------------------------------------------- warps (liquify)
class Warp:
    def __init__(self):
        self.dx = np.zeros((H, W), np.float32)
        self.dy = np.zeros((H, W), np.float32)
        self.yy, self.xx = np.mgrid[0:H, 0:W].astype(np.float32)

    def bulge(self, c, R, s):
        """s>0 agranda, s<0 encoge (la muestra se acerca/aleja del centro)"""
        ddx, ddy = self.xx - c[0], self.yy - c[1]
        r = np.sqrt(ddx ** 2 + ddy ** 2) / R
        g = np.where(r < 1, (1 - r ** 2) ** 2, 0).astype(np.float32)
        f = -s * g
        self.dx += ddx * f
        self.dy += ddy * f

    def shift(self, c, R, d):
        """desplaza el contenido d=(dx,dy) con caida gaussiana"""
        g = blob(c, R)
        self.dx -= d[0] * g
        self.dy -= d[1] * g

    def apply(self, img, interp=cv2.INTER_CUBIC):
        return cv2.remap(img, self.xx + self.dx, self.yy + self.dy, interp, borderMode=cv2.BORDER_REPLICATE)


# ---------------------------------------------------------------- mapas de tono y direccion
def tone_map(img, fg, lo_p=3, hi_p=88, gamma=1.25):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cl = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(6, 6)).apply(g).astype(np.float32)
    cl = cv2.GaussianBlur(cl, (0, 0), 1.4)
    sel = cl[fg > 0.6]
    hi = np.percentile(sel, hi_p)
    lo = np.percentile(sel, lo_p)
    D = np.clip((hi - cl) / (hi - lo + 1e-6), 0, 1) ** gamma
    return D.astype(np.float32), g


def flow_field(g, crown, mask, sigma=9):
    """orientacion por tensor de estructura, mezclada con un flujo radial desde la coronilla"""
    gf = cv2.GaussianBlur(g.astype(np.float32), (0, 0), 1.5)
    gx = cv2.Sobel(gf, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gf, cv2.CV_32F, 0, 1, ksize=3)
    jxx = cv2.GaussianBlur(gx * gx, (0, 0), sigma)
    jxy = cv2.GaussianBlur(gx * gy, (0, 0), sigma)
    jyy = cv2.GaussianBlur(gy * gy, (0, 0), sigma)
    ang = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2  # tangente al borde
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (jxx + jyy + 1e-6)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rad = np.pi / 2 - np.clip((xx - crown[0]) / 450.0, -1.2, 1.2) * 0.62
    # mezcla en el espacio de vectores dobles
    w = np.clip(coh * 1.2, 0, 0.4)
    cx = (1 - w) * np.cos(2 * rad) + w * np.cos(2 * ang)
    sx = (1 - w) * np.sin(2 * rad) + w * np.sin(2 * ang)
    return 0.5 * np.arctan2(sx, cx)


# ---------------------------------------------------------------- generadores de trazos
class Strokes:
    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)
        self.items = []  # (tipo, grosor, orden, pts)

    def add(self, typ, w, order, pts):
        if len(pts) >= 2:
            self.items.append((typ, w, order, pts))


def bend_field(seed):
    """desplazamiento suave para que el rayado no sea una regla"""
    return snoise((H, W), 60, seed) * 5.0, snoise((H, W), 60, seed + 1) * 5.0


def hatch(st, D, mask, angle, spacing, lo, hi, typ, w, order, seed, chunk=(22, 70), fine=False):
    rng = np.random.default_rng(seed)
    bx, by = bend_field(seed + 11)
    th = np.deg2rad(angle)
    d = np.array([np.cos(th), np.sin(th)])
    n = np.array([-np.sin(th), np.cos(th)])
    diag = np.hypot(W, H)
    c = np.array([W / 2, H / 2])
    Dm = D * mask
    step = 2.0
    ts = np.arange(-diag / 2, diag / 2, step)
    k = -diag / 2
    while k < diag / 2:
        k += spacing * rng.uniform(0.8, 1.2)
        P = c[None, :] + k * n[None, :] + ts[:, None] * d[None, :]
        ix = np.round(P[:, 0]).astype(int)
        iy = np.round(P[:, 1]).astype(int)
        ins = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
        if ins.sum() < 5:
            continue
        v = np.zeros(len(ts), np.float32)
        v[ins] = Dm[iy[ins], ix[ins]]
        thr = lo + (hi - lo) * rng.random()
        act = v > thr
        # corrido de tramos activos
        idx = np.flatnonzero(np.diff(np.concatenate([[0], act.astype(int), [0]])))
        for a, b in zip(idx[0::2], idx[1::2]):
            i = a
            while i < b:
                L = int(rng.uniform(*chunk) / step)
                j = min(b, i + L)
                if j - i >= 4:
                    sub = P[i:j:4] if j - i > 8 else P[[i, j - 1]]
                    if (j - 1 - i) % 4 and j - i > 8:
                        sub = np.vstack([sub, P[j - 1]])
                    pts = []
                    for q in sub:
                        x = int(np.clip(q[0], 0, W - 1))
                        y = int(np.clip(q[1], 0, H - 1))
                        pts.append((q[0] + bx[y, x], q[1] + by[y, x]))
                    st.add(typ, w, order + rng.random() * 0.2, pts)
                i = j + int(rng.uniform(0, 3))
    return st


def trace_hair(st, D, mask, theta, spacing, thr, typ, w, order, seed, length=(30, 90)):
    rng = np.random.default_rng(seed)
    ys = np.arange(0, H, spacing)
    xs = np.arange(0, W, spacing)
    for y in ys:
        for x in xs:
            sx = x + rng.uniform(-spacing, spacing) * 0.6
            sy = y + rng.uniform(-spacing, spacing) * 0.6
            ix, iy = int(sx), int(sy)
            if not (0 <= ix < W and 0 <= iy < H):
                continue
            if mask[iy, ix] < 0.5:
                continue
            dd = D[iy, ix]
            if dd < thr or rng.random() > 0.35 + dd * 0.85:
                continue
            L = rng.uniform(*length)
            p = np.array([sx, sy])
            a = theta[iy, ix]
            dirv = np.array([np.cos(a), np.sin(a)])
            if dirv[1] < 0:
                dirv = -dirv
            pts = [tuple(p)]
            tot = 0
            wob = rng.uniform(-0.06, 0.06)
            while tot < L:
                ix, iy = int(p[0]), int(p[1])
                if not (0 <= ix < W and 0 <= iy < H) or mask[iy, ix] < 0.45:
                    break
                a = theta[iy, ix] + wob * np.sin(tot * 0.15 + sx)
                nd = np.array([np.cos(a), np.sin(a)])
                if nd @ dirv < 0:
                    nd = -nd
                dirv = 0.6 * dirv + 0.4 * nd
                dirv /= np.linalg.norm(dirv) + 1e-6
                p = p + dirv * 4.0
                tot += 4.0
                pts.append(tuple(p))
            st.add(typ, w, order + rng.random() * 0.3, pts)


def contour_strokes(st, D, mask, typ, w, order, seed, lo=0.05, hi=0.15, minlen=70, hairmask=None, hair_skip=0.5):
    """contornos finos desde canny sobre el mapa de tono suavizado"""
    rng = np.random.default_rng(seed)
    d8 = np.clip(cv2.GaussianBlur(D, (0, 0), 1.8) * 255, 0, 255).astype(np.uint8)
    e = cv2.Canny(d8, int(lo * 255), int(hi * 255))
    e = (e > 0) & (mask > 0.55)
    if hairmask is not None:
        e &= hairmask < hair_skip
    e = e.astype(np.uint8) * 255
    cs, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        c = c[:, 0, :].astype(np.float32)
        if len(c) < minlen:
            continue
        c = c[: len(c) // 2 + 1]  # el contorno de una linea de 1px va y vuelve
        if len(c) < minlen // 2:
            continue
        # suavizado
        k = 5
        pad = np.pad(c, ((k, k), (0, 0)), mode="edge")
        ker = np.ones(2 * k + 1) / (2 * k + 1)
        cs_ = np.stack([np.convolve(pad[:, 0], ker, "valid"), np.convolve(pad[:, 1], ker, "valid")], 1)
        s = 0
        while s < len(cs_) - 4:
            ln = int(rng.uniform(40, 110))
            seg = cs_[s: s + ln: 5]
            if len(seg) >= 3:
                ix = np.clip(seg[:, 0].astype(int), 0, W - 1)
                iy = np.clip(seg[:, 1].astype(int), 0, H - 1)
                dens = D[iy, ix].mean()
                if rng.random() < 0.25 + dens * 1.4:
                    st.add(typ, w, order + rng.random() * 0.2, [tuple(p) for p in seg])
            s += ln - 4
    return st


def curve(p0, p1, bow=0.0, n=14, jitter=0.0, rng=None):
    p0 = np.array(p0, np.float32)
    p1 = np.array(p1, np.float32)
    t = np.linspace(0, 1, n)[:, None]
    d = p1 - p0
    nrm = np.array([-d[1], d[0]]) / (np.linalg.norm(d) + 1e-6)
    pts = p0 + d * t + nrm * bow * np.sin(np.pi * t) * np.linalg.norm(d)
    if jitter and rng is not None:
        pts = pts + rng.normal(0, jitter, pts.shape)
    return [tuple(p) for p in pts]



def lid_pts(p0, p1, bow, n=16):
    """curva cuadratica entre dos esquinas; bow>0 abomba hacia arriba (y menor)"""
    p0 = np.array(p0, np.float32)
    p1 = np.array(p1, np.float32)
    mid = (p0 + p1) / 2
    d = p1 - p0
    nrm = np.array([d[1], -d[0]], np.float32)
    nrm /= (np.linalg.norm(nrm) + 1e-6)
    if nrm[1] > 0:
        nrm = -nrm
    ctrl = mid + nrm * bow * np.linalg.norm(d) * 2
    t = np.linspace(0, 1, n)[:, None]
    q = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * ctrl + t ** 2 * p1
    return [tuple(v) for v in q]


def eye_draw(st, rng, inner, outer, iris, r, bow, wpt, order, closed=False):
    up = [wpt(p) for p in lid_pts(outer, inner, bow if not closed else -bow * 0.55)]
    lo = [wpt(p) for p in lid_pts(outer, inner, -bow * 0.35 if not closed else -bow * 0.62)]
    st.add(4, 2, order, up)
    if not closed:
        st.add(4, 1, order, lo)
        crease = [wpt(p) for p in lid_pts((outer[0] + (inner[0] - outer[0]) * 0.08, outer[1] - 10),
                                          (inner[0] - (inner[0] - outer[0]) * 0.1, inner[1] - 16), bow * 1.1)]
        st.add(4, 1, order + 0.01, crease)
        c = np.array(wpt(iris), np.float32)
        for a0, a1 in ((-0.35, 3.5),):
            pts = [tuple(c + r * np.array([np.cos(a), np.sin(a)])) for a in np.linspace(a0, a1, 16)]
            st.add(4, 2, order + 0.02, pts)
        for _ in range(9):
            a0 = rng.uniform(0.2, 2.9)
            st.add(4, 1, order + 0.03, [tuple(c + r * 0.15 * np.array([np.cos(a0), np.sin(a0)])), tuple(c + r * 0.9 * np.array([np.cos(a0), np.sin(a0)]))])
        for _ in range(3):
            a0 = rng.uniform(0.3, 2.8)
            st.add(4, 1, order + 0.03, [tuple(c + r * 0.3 * np.array([np.cos(a0), np.sin(a0)])), tuple(c + r * 0.5 * np.array([np.cos(a0 + .4), np.sin(a0 + .4)]))])
    # pestanas: del lado exterior
    n = len(up)
    for i in range(int(n * 0.1), int(n * 0.65), 2):
        p = np.array(up[i])
        q = np.array(up[min(n - 1, i + 1)])
        d = q - p
        nrm = np.array([d[1], -d[0]]) / (np.linalg.norm(d) + 1e-6)
        if (nrm[1] > 0) != closed:
            nrm = -nrm
        L = rng.uniform(8, 15)
        st.add(4, 1, order + 0.04, [tuple(p), tuple(p + nrm * L + d * 0.8)])


# ---------------------------------------------------------------- acuarela
def edge_noise_mask(m, seed, amp=9.0):
    """bordes irregulares de acuarela: desplaza la mascara con ruido suave y la perfila"""
    nx = snoise((H, W), 14, seed) * amp
    ny = snoise((H, W), 14, seed + 5) * amp
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    m2 = cv2.remap(m, xx + nx, yy + ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    m2 = cv2.GaussianBlur(m2, (0, 0), 3.0)
    # pigmento que se acumula en el borde
    inner = cv2.GaussianBlur(m2, (0, 0), 9)
    rim = np.clip(m2 - inner, 0, 1) * 0.9
    return np.clip(m2 + rim * 0.6, 0, 1), m2


def wash(layer, mask, rgb, alpha, seed, amp=9.0, mod=None, blotch=0.18):
    """acumula un lavado: layer (H,W,4) color + alfa. rgb en rgb 0-255"""
    m, m2 = edge_noise_mask(mask, seed, amp)
    a = m * alpha
    a *= 1 + blotch * snoise((H, W), 30, seed + 9)
    if mod is not None:
        a *= mod
    a = np.clip(a, 0, 0.95)
    col = np.array(rgb, np.float32)
    # mezcla alfa sobre capa existente (a1 + a2 - a1*a2) y color ponderado
    a0 = layer[..., 3]
    na = a0 + a - a0 * a
    for i in range(3):
        layer[..., i] = np.where(na > 1e-4, (layer[..., i] * a0 * (1 - a) + col[i] * a) / np.maximum(na, 1e-4), 0)
    layer[..., 3] = na


# ---------------------------------------------------------------- papel y render
def paper(seed=3):
    base = np.ones((H, W, 3), np.float32) * PAPER
    fib = snoise((H, W), 1.2, seed) * 1.1 + snoise((H, W), 5, seed + 1) * 1.6 + snoise((H, W), 60, seed + 2) * 3.5
    base += fib[..., None]
    # manchas de humedad
    st = np.clip(snoise((H, W), 90, seed + 3), 0, None) * 5
    base[..., 0] -= st * 0.6
    base[..., 1] -= st * 0.9
    base[..., 2] -= st * 1.1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = ((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2
    base *= (1 - 0.10 * np.clip(v, 0, 1.4))[..., None]
    return np.clip(base, 0, 255)


def raster_ink(strokes, scale=2):
    """devuelve cobertura por tipo (float 0-1) a resolucion W,H"""
    covs = {}
    for typ in sorted(set(s[0] for s in strokes)):
        covs[typ] = np.zeros((H * scale, W * scale), np.uint8)
    for typ, w, order, pts in strokes:
        arr = (np.array(pts, np.float32) * scale).astype(np.int32)
        th = max(1, int(round(w * 0.55 * scale)))
        cv2.polylines(covs[typ], [arr], False, 255, th, cv2.LINE_AA)
    out = {}
    for typ, c in covs.items():
        out[typ] = cv2.resize(c, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    return out


def compose(pap, aguada, covs):
    img = pap.copy()
    a = aguada[..., 3:4]
    rgb_bgr = aguada[..., [2, 1, 0]]
    img = img * (1 - a) + img * (rgb_bgr / 255.0) * a  # multiply
    for typ, cov in covs.items():
        col = INK_DARK if typ in (0, 4) else INK
        op = {0: 0.92, 1: 0.72, 2: 0.85, 3: 0.65, 4: 0.95}.get(typ, 0.8)
        cv = (cov * op)[..., None]
        img = img * (1 - cv) + img * (col[None, None, :] / 255.0) * cv
    return np.clip(img, 0, 255).astype(np.uint8)


def quantize_export(strokes, path):
    """deltas enteros: [tipo, grosor, x0, y0, dx1, dy1, ...]. orden: contornos -> sombras"""
    strokes = sorted(strokes, key=lambda s: (s[2]))
    rows = []
    for typ, w, order, pts in strokes:
        q = [(int(round(x)), int(round(y))) for x, y in pts]
        dedup = [q[0]]
        for p in q[1:]:
            if p != dedup[-1]:
                dedup.append(p)
        if len(dedup) < 2:
            continue
        row = [typ, int(w), dedup[0][0], dedup[0][1]]
        for a, b in zip(dedup[:-1], dedup[1:]):
            row += [b[0] - a[0], b[1] - a[1]]
        rows.append(row)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"w": W, "h": H, "s": rows}, f, separators=(",", ":"))
    return len(rows)


def finalize(name, items, ag):
    OUT.mkdir(parents=True, exist_ok=True)
    n = quantize_export(items, OUT / (name + ".json"))
    covs = raster_ink(items)
    pap = paper(11 + len(name))
    img = compose(pap, ag, covs)
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(OUT / (name + ".png"), optimize=True)
    out = np.dstack([np.clip(ag[..., :3], 0, 255).astype(np.uint8), (np.clip(ag[..., 3], 0, 1) * 255).astype(np.uint8)])
    Image.fromarray(out).resize((900, 1125), Image.LANCZOS).save(OUT / (name + "-aguada.webp"), quality=78, method=6)
    print("   ok", n, "trazos", flush=True)


# ---------------------------------------------------------------- sujeto: 6.jpg (tres cuartos, buena luz)
def load6(angle=-8.0):
    im = leer_bgr(REF / "6.jpg")
    c = (517, 280)
    M = cv2.getRotationMatrix2D(c, angle, 1.45)
    M[0, 2] += 600 - c[0]
    M[1, 2] += 660 - c[1]
    a = cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    global OUTSIDE
    OUTSIDE = 1.0 - cv2.warpAffine(np.ones(im.shape[:2], np.float32), M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return a, M


def mp(M, pts):
    return [tuple((M @ np.array([x, y, 1.0])).tolist()) for x, y in pts]


# zonas en coordenadas de 6.jpg
FG6 = [(150, 100), (200, 10), (260, -90), (360, -150), (480, -170), (620, -150), (700, -80), (730, 20), (735, 100), (722, 150), (698, 260),
       (694, 420), (668, 520), (640, 590), (612, 650), (600, 740), (430, 740), (400, 680), (382, 600), (350, 540),
       (292, 470), (240, 462), (206, 385), (212, 330), (160, 250), (135, 120)]
HAIR6 = [(140, 100), (192, 5), (255, -95), (360, -158), (480, -178), (625, -158), (706, -85), (738, 20), (745, 100), (722, 150), (690, 150), (640, 112), (560, 98), (480, 128), (380, 175), (300, 230),
         (264, 300), (262, 360), (215, 330), (150, 250), (118, 120)]
EYE_L = dict(outer=(375, 316), inner=(488, 296), iris=(433, 300), r=13, bow=0.16)
EYE_R = dict(inner=(568, 272), outer=(658, 255), iris=(607, 264), r=12.5, bow=0.2)
BROW_L = [(322, 274), (380, 254), (440, 241), (494, 240)]
BROW_R = [(566, 238), (600, 223), (640, 209), (670, 204)]
MOUTH = (585, 505)


def zonas(M, warp=None):
    f = lambda pts, b=0: poly(mp(M, pts), b)
    fg = f(FG6, 20)
    yy = np.arange(H, dtype=np.float32)[:, None]
    fg = fg * np.broadcast_to(np.clip((1330 - yy) / 170.0, 0, 1), (H, W))
    hair = f(HAIR6, 6)
    m = dict(fg=fg, hair=hair)
    mc = mp(M, [MOUTH])[0]
    m["lips"] = ell(mc, (int(62 * 1.45), int(22 * 1.45)), -8, 4)
    return m


def brow_strokes(st, M, pts, rng, n=70):
    P = np.array(mp(M, pts), np.float32)
    seg = np.diff(P, axis=0)
    ln = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.concatenate([[0], np.cumsum(ln)])
    L = cum[-1]
    for _ in range(n):
        d = rng.uniform(0, L)
        i = min(np.searchsorted(cum, d) - 1, len(seg) - 1)
        u = (d - cum[i]) / (ln[i] + 1e-6)
        base = P[i] + seg[i] * u
        tan = seg[i] / (ln[i] + 1e-6)
        nrm = np.array([-tan[1], tan[0]])
        if nrm[1] > 0:
            nrm = -nrm
        # grosor: mas ancha hacia dentro
        wid = lerp_(11, 7, d / L) * 1.45
        base = base + nrm * rng.uniform(-0.4, 0.8) * wid
        ang = tan * np.cos(0.25) + nrm * np.sin(0.25)
        L2 = rng.uniform(12, 22) * 1.2
        pts2 = [tuple(base), tuple(base + ang * L2 * 0.5 + nrm * 0.8), tuple(base + ang * L2)]
        st.add(2, 1, 0.08, pts2)


def lerp_(a, b, t):
    return a + (b - a) * float(np.clip(t, 0, 1))


def lid_line(st, M, e, rng, order=0.06, bow=None):
    """parpado superior con trazo fino y unas pocas pestanas. sin aros, sin circulos"""
    p0, p1 = mp(M, [e["outer"]])[0], mp(M, [e["inner"]])[0]
    up = lid_pts(p0, p1, e.get("bow", 0.18) if bow is None else bow)
    st.add(4, 2, order, up)
    n = len(up)
    for i in range(int(n * 0.05), int(n * 0.6), 2):
        p = np.array(up[i])
        q = np.array(up[min(n - 1, i + 1)])
        d = q - p
        nrm = np.array([d[1], -d[0]]) / (np.linalg.norm(d) + 1e-6)
        if nrm[1] > 0:
            nrm = -nrm
        L = rng.uniform(6, 11)
        st.add(4, 1, order + 0.01, [tuple(p), tuple(p + nrm * L + d * 0.6)])


def warp_pt(warp, p):
    x = int(np.clip(p[0], 0, W - 1))
    y = int(np.clip(p[1], 0, H - 1))
    return (p[0] - warp.dx[y, x], p[1] - warp.dy[y, x])




# ================================================================ version 2: sobre los tonos de la foto
S6 = 1.55
M6 = np.array([[S6, 0, 600 - 517 * S6], [0, S6, 770 - 280 * S6]], np.float32)

FG6B = [(150, 100), (200, 10), (260, -90), (360, -150), (480, -170), (620, -150), (690, -80), (712, 20), (708, 100),
        (700, 150), (694, 260), (692, 380), (706, 430), (850, 415), (850, 820), (240, 820), (300, 640), (345, 560),
        (350, 540), (292, 470), (240, 462), (206, 385), (212, 330), (160, 250), (135, 120)]
SHIRT6 = [(352, 548), (300, 640), (240, 820), (850, 820), (850, 415), (706, 430), (700, 470), (640, 590), (612, 650),
          (560, 690), (470, 700), (400, 650), (382, 600)]


def zhang_suen(img):
    """adelgaza un mapa binario a lineas de 1 px"""
    im = (img > 0).astype(np.uint8)
    for _ in range(60):
        ch = 0
        for paso in (0, 1):
            P = np.pad(im, 1)
            p2, p3, p4, p5 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:], P[2:, 2:]
            p6, p7, p8, p9 = P[2:, 1:-1], P[2:, :-2], P[1:-1, :-2], P[:-2, :-2]
            B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if paso == 0:
                c1 = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                c1 = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            m = (im == 1) & (B >= 2) & (B <= 6) & (A == 1) & c1
            if m.any():
                im[m] = 0
                ch += int(m.sum())
        if ch == 0:
            break
    return im


def xdog_strokes(st, Ln, mask, exclude, seed, sigma=1.1, eps=0.018, minlen=26, typ=0, w=1):
    """contornos xdog (diferencia de gaussianas extendida) vectorizados a polilineas finas"""
    rng = np.random.default_rng(seed)
    g1 = cv2.GaussianBlur(Ln, (0, 0), sigma)
    g2 = cv2.GaussianBlur(Ln, (0, 0), sigma * 1.6)
    d = g1 - 0.98 * g2
    edge = (d < -eps) & (mask > 0.5) & (exclude < 0.5)
    edge = cv2.morphologyEx(edge.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    sk = zhang_suen(edge)
    cs, _ = cv2.findContours(sk * 255, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        c = c[:, 0, :].astype(np.float32)
        if len(c) < minlen:
            continue
        c = c[: len(c) // 2 + 1]
        k = 3
        pad = np.pad(c, ((k, k), (0, 0)), mode="edge")
        ker = np.ones(2 * k + 1) / (2 * k + 1)
        cs_ = np.stack([np.convolve(pad[:, 0], ker, "valid"), np.convolve(pad[:, 1], ker, "valid")], 1)
        s0 = 0
        while s0 < len(cs_) - 5:
            ln = int(rng.uniform(55, 130))
            seg = cs_[s0: s0 + ln: 4]
            if len(seg) >= 3:
                st.add(typ, w, 0.0 + rng.random() * 0.2, [tuple(q) for q in seg])
            s0 += ln - 3
    return st


def skin_ramp(t, vieja=False):
    """moreno calido: sombras #6e4530, medios #9a6644, luces #b07a55. en el aguada (se multiplica sobre el papel)"""
    papel = np.array([236, 224, 196], np.float32)
    anchors = np.array([[0x6e, 0x45, 0x30], [0x9a, 0x66, 0x44], [0xb0, 0x7a, 0x55], [0xb8, 0x84, 0x62]], np.float32) / papel * 255
    anchors = np.clip(anchors, 0, 255)
    if vieja:
        g = anchors.mean(1, keepdims=True)
        anchors = anchors * 0.75 + g * 0.25
        anchors = anchors * 0.93 + 255 * 0.07
    xs = np.array([0, 0.35, 0.7, 1.0], np.float32)
    out = np.zeros(t.shape + (3,), np.float32)
    for ch in range(3):
        out[..., ch] = np.interp(t, xs, anchors[:, ch])
    return out


def wash_img(layer, mask, rgb, alpha, seed, amp=7.0, blotch=0.05, mod=None):
    m, _ = edge_noise_mask(mask, seed, amp)
    a = m * alpha * (1 + blotch * snoise((H, W), 30, seed + 9))
    if mod is not None:
        a = a * mod
    a = np.clip(a, 0, 0.95)
    a0 = layer[..., 3]
    na = a0 + a - a0 * a
    for i in range(3):
        layer[..., i] = np.where(na > 1e-4, (layer[..., i] * a0 * (1 - a) + rgb[..., i] * a) / np.maximum(na, 1e-4), 0)
    layer[..., 3] = na


def build(name):
    print("::", name, flush=True)
    seed = sum(map(ord, name)) * 7 + 17
    rng = np.random.default_rng(seed)
    im = leer_bgr(REF / "6.jpg")
    base = cv2.warpAffine(im, M6, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    outside = 1.0 - cv2.warpAffine(np.ones(im.shape[:2], np.float32), M6, (W, H), flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    M = M6
    f = lambda pts, b=0: poly(mp(M, pts), b)
    fg = f(FG6B, 18)
    yy = np.arange(H, dtype=np.float32)[:, None]
    fade = np.broadcast_to(np.clip((1440 - yy) / 330.0, 0, 1), (H, W)).astype(np.float32)
    fg = fg * fade
    hair = f(HAIR6, 6)
    shirt = f(SHIRT6, 10) * fade
    lm = {k: mp(M, [v])[0] for k, v in dict(eyeL=EYE_L["iris"], eyeR=EYE_R["iris"], nose=(550, 395), chin=(540, 600),
                                             jawL=(305, 490), jawR=(655, 520), chkL=(365, 430), chkR=(650, 420)).items()}
    warp = Warp()
    if name == "nino":
        warp.bulge(lm["eyeL"], 125, 0.40); warp.bulge(lm["eyeR"], 115, 0.40)
        warp.shift(((lm["eyeL"][0] + lm["eyeR"][0]) / 2, lm["eyeL"][1]), 230, (0, 42))
        warp.bulge(lm["nose"], 120, -0.30); warp.bulge(lm["chin"], 200, -0.30)
        warp.bulge(lm["chkL"], 170, 0.22); warp.bulge(lm["chkR"], 170, 0.22)
        warp.shift(lm["chin"], 240, (0, -28))
    elif name == "adulto":
        warp.bulge(lm["jawL"], 150, 0.14); warp.bulge(lm["jawR"], 150, 0.14); warp.shift(lm["chin"], 150, (0, 26))
    elif name == "viejo":
        warp.shift(mp(M, [(380, 540)])[0], 110, (-5, 20)); warp.shift(mp(M, [(640, 540)])[0], 110, (5, 20))

    if name == "muerte":
        m = np.zeros((H, W), np.uint8)
        for e in (EYE_L, EYE_R):
            c = mp(M, [e["iris"]])[0]
            cv2.ellipse(m, (int(c[0]), int(c[1])), (int(58 * S6), int(22 * S6)), -8, 0, 360, 255, -1)
        base = cv2.inpaint(base, m, 8, cv2.INPAINT_TELEA)
    # extension del craneo hacia arriba: el pelo ya esta reflejado; el color se oscurece
    if name == "viejo":
        rec = poly(mp(M, [(330, 215), (400, 150), (500, 90), (580, 50), (660, 70), (700, 130), (660, 190), (560, 150), (460, 195)]), 8)
        reg = base[int(mp(M, [(430, 150)])[0][1]):int(mp(M, [(430, 215)])[0][1]), int(mp(M, [(430, 150)])[0][0]):int(mp(M, [(600, 150)])[0][0])]
        piel = np.median(reg.reshape(-1, 3), axis=0).astype(np.float32)
        base = (base * (1 - rec[..., None]) + piel * rec[..., None]).astype(np.uint8)
    base = warp.apply(base)
    fg, hair, shirt, outside = (warp.apply(x, cv2.INTER_LINEAR) for x in (fg, hair, shirt, outside))
    if name == "viejo":
        hair = np.clip(hair - warp.apply(rec, cv2.INTER_LINEAR), 0, 1)

    # tonos de la foto
    den = cv2.bilateralFilter(base, 7, 25, 7)
    gray = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(cv2.cvtColor(den, cv2.COLOR_BGR2GRAY)).astype(np.float32)
    sel = gray[fg > 0.7]
    lo, hi = np.percentile(sel, 2), np.percentile(sel, 97)
    Ln = np.clip((gray - lo) / (hi - lo), 0, 1)
    Ln = cv2.GaussianBlur(Ln, (0, 0), 0.8)
    # el pelo: oscuro dentro de la zona, y la corona (fuera de la foto) siempre
    force = warp.apply(poly(mp(M, [(100, -400), (800, -400), (800, 45), (100, 45)]), 10), cv2.INTER_LINEAR)
    out_ = np.clip(cv2.GaussianBlur(outside, (0, 0), 6) * 1.5, 0, 1)
    Fz = cv2.GaussianBlur(np.maximum(force, out_) * hair, (0, 0), 3)
    Ln = Ln * (1 - Fz) + 0.07 * Fz
    hair_dark = np.clip((0.40 - cv2.GaussianBlur(Ln, (0, 0), 1.5)) / 0.10, 0, 1)
    hair_m = cv2.GaussianBlur(np.clip(hair * np.maximum(hair_dark, np.maximum(force, out_)), 0, 1), (0, 0), 1.6)
    hair_m = hair_m * np.clip(fg * 2.0, 0, 1)
    cl_ = cv2.morphologyEx((hair_m > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8)).astype(np.float32)
    hair_m = np.maximum(hair_m, cv2.GaussianBlur(cl_ * (hair > 0.5), (0, 0), 2))
    cl2 = cv2.morphologyEx((hair_m > 0.35).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((55, 55), np.uint8)).astype(np.float32)
    hair_m = np.maximum(hair_m, cv2.GaussianBlur(cl2 * (hair > 0.3), (0, 0), 2))
    if name == "viejo":
        hair_m = np.clip(hair_m - warp.apply(rec, cv2.INTER_LINEAR), 0, 1)
    skin = np.clip(fg - hair_m - shirt, 0, 1)

    # ajustes de tono por edad
    Lw = Ln.copy()
    if name == "adulto":
        beard = warp.apply(poly(mp(M, [(310, 480), (380, 500), (470, 545), (520, 548), (600, 530), (655, 500), (672, 470), (672, 540),
                                      (640, 600), (560, 645), (450, 628), (380, 585), (335, 532)]), 14), cv2.INTER_LINEAR) * skin
        Lw = Lw - 0.12 * beard
        for c_ in (mp(M, [(430, 336)])[0], mp(M, [(612, 296)])[0]):
            Lw = Lw - 0.16 * blob(c_, 34)
    # realce de ojos: mas capas de sombra donde esta el detalle
    eyez = np.zeros((H, W), np.float32)
    for e in (EYE_L, EYE_R):
        c = warp_pt(warp, mp(M, [e["iris"]])[0])
        cv2.ellipse(eyez, (int(c[0]), int(c[1])), (int(70 * S6), int(26 * S6)), -8, 0, 360, 1.0, -1)
    eyez = cv2.GaussianBlur(eyez, (0, 0), 6)
    Lw = Lw - 0.16 * eyez * (name != "muerte")

    if os.environ.get('RDEBUG'):
        d = os.environ['RDEBUG']
        g1 = cv2.GaussianBlur(Ln, (0, 0), 1.1); g2 = cv2.GaussianBlur(Ln, (0, 0), 1.76)
        dd = np.clip(0.5 + (g1 - 0.98 * g2) * 8, 0, 1)
        tile = np.hstack([Ln, hair_m, skin, dd])
        cv2.imwrite(d + 'dbg.jpg', cv2.resize((tile * 255).astype(np.uint8), None, fx=0.4, fy=0.4))
    st = Strokes(seed)
    # 1) contornos xdog
    excl = np.clip(cv2.erode((hair_m > 0.6).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32) + (shirt > 0.5) * 1.0, 0, 1)
    xs_eps = 0.010 if name != "muerte" else 0.016
    xdog_strokes(st, Ln, fg, excl, seed, eps=xs_eps, minlen=24 if name != "muerte" else 38, w=1)
    A = -55
    nlay = {"nino": 2, "muerte": 1}.get(name, 4)
    thr = [0.82, 0.62, 0.42, 0.22]
    spc = [5.0, 4.2, 4.0, 3.4]
    ang = [A, A, A + 72, A + 28]
    if name == "nino":
        spc = [6.5, 5.5, 4, 3.4]
    for k in range(nlay):
        mk = np.clip((thr[k] - Lw) / 0.07, 0, 1) * skin
        mk = cv2.GaussianBlur(mk, (0, 0), 1.5)
        hatch(st, mk, np.ones((H, W), np.float32), ang[k], spc[k] * (1.8 if name == "muerte" else 1), 0.35, 0.65, 1, 1, 1.0 + k, seed + k,
              chunk=(18, 48) if k >= 2 else (30, 90))
    # 2) pelo: trazos que siguen la forma + capa oscura
    Dh = np.clip(1 - Ln, 0, 1)
    if name == "viejo":
        Dh = Dh * 0.45
    flow = flow_field(cv2.cvtColor(base, cv2.COLOR_BGR2GRAY), mp(M, [(420, -120)])[0], hair_m, sigma=9)
    if name == "muerte":
        trace_hair(st, np.clip(Dh, 0, 1), hair_m, flow, 13.0, 0.4, 2, 1, 1.5, seed + 4, length=(50, 110))
    else:
        trace_hair(st, np.clip(Dh + 0.1, 0, 1), hair_m, flow, 6.5 if name != "viejo" else 9.0, 0.30, 2, 1, 1.5, seed + 4, length=(45, 115))
        hatch(st, Dh, hair_m, A, 5.0 if name != "viejo" else 8.0, 0.6, 0.98, 2, 1, 2.5, seed + 5, chunk=(30, 90))
    # 3) camisa negra: rayado suelto que se desvanece hacia abajo
    if name != "muerte":
        yfade = np.broadcast_to(np.clip((1420 - yy) / 330.0, 0, 1), (H, W)).astype(np.float32)
        hatch(st, yfade * 0.9, shirt, A, 6.5, 0.15, 0.85, 1, 1, 3.5, seed + 6, chunk=(30, 90))
        hatch(st, yfade * 0.8, shirt * (1 - 0.0), A + 40, 9.0, 0.35, 0.8, 1, 1, 3.6, seed + 7, chunk=(20, 60))
    # 4) cejas y parpados
    if name != 'muerte':
        for e in (EYE_L, EYE_R):
            p0, p1 = mp(M, [e['outer']])[0], mp(M, [e['inner']])[0]
            up = [warp_pt(warp, q) for q in lid_pts(p0, p1, e['bow'])]
            st.add(4, 2, 0.06, up)
    brow_strokes(st, M, BROW_L, rng, n=60 if name != "muerte" else 20)
    brow_strokes(st, M, BROW_R, rng, n=45 if name != "muerte" else 15)
    if name == "muerte":
        for e in (EYE_L, EYE_R):
            p0, p1 = mp(M, [e["outer"]])[0], mp(M, [e["inner"]])[0]
            lid = lid_pts(p0, p1, -0.13)
            st.add(4, 2, 0.06, lid)
            n_ = len(lid)
            for i in range(int(n_ * 0.05), int(n_ * 0.65), 3):
                p, q = np.array(lid[i]), np.array(lid[min(n_ - 1, i + 1)])
                d = q - p
                nrm = np.array([-d[1], d[0]]) / (np.linalg.norm(d) + 1e-6)
                if nrm[1] < 0:
                    nrm = -nrm
                st.add(4, 1, 0.07, [tuple(p), tuple(p + nrm * rng.uniform(5, 9) + d * 0.6)])

    # 5) extras por edad
    if name == "adulto":
        hatch(st, np.clip(0.5 + 0.5 * beard, 0, 1), beard, -68, 2.8, 0.30, 0.75, 3, 1, 6.0, seed + 8, chunk=(5, 13))
        hatch(st, np.clip(0.5 + 0.5 * beard, 0, 1), beard, -40, 3.4, 0.45, 0.8, 3, 1, 6.1, seed + 9, chunk=(5, 11))
    if name == "viejo":
        for i in range(5):
            y = 98 + i * 24
            a_, b_ = mp(M, [(395 + rng.uniform(-10, 10), y + 8), (655 + rng.uniform(-10, 10), y - 8 + rng.uniform(-4, 4))])
            st.add(3, 1, 6.0, curve(a_, b_, rng.uniform(-0.04, 0.04), 24, 0.9, rng))
        for (ox, oy), sgn in (((375, 316), -1), ((658, 255), 1)):
            for k in range(4):
                a_, b_ = mp(M, [(ox + sgn * 8, oy + (k - 1.5) * 6), (ox + sgn * (52 + k * 4), oy + (k - 1.5) * 22)])
                st.add(3, 1, 6.2, curve(a_, b_, 0.06, 8, 0.5, rng))
        for cx, cy, w_ in ((432, 336, 52), (607, 296, 44)):
            for dy in (0, 14):
                a_, b_ = mp(M, [(cx - w_, cy + dy), (cx + w_, cy + dy - 5)])
                st.add(3, 1, 6.3, curve(a_, b_, 0.2, 12, 0.5, rng))
        for pts in ([(522, 418), (492, 470), (484, 522)], [(600, 428), (648, 474), (662, 524)]):
            q = mp(M, pts)
            st.add(3, 1, 6.4, curve(q[0], q[1], 0.1, 14, 0.7, rng))
            st.add(3, 1, 6.4, curve(q[1], q[2], 0.08, 12, 0.7, rng))
        for k in range(2):
            a_, b_ = mp(M, [(418 + k * 14, 226), (420 + k * 16, 252)])
            st.add(3, 1, 6.1, curve(a_, b_, 0.05, 8, 0.4, rng))

    items = st.items
    if len(items) > MAXSTROKES:
        keep = [s_ for s_ in items if s_[0] in (0, 3, 4)]
        rest = [s_ for s_ in items if s_[0] not in (0, 3, 4)]
        rng.shuffle(rest)
        items = keep + rest[: max(0, MAXSTROKES - len(keep))]
    print("   trazos:", len(items), flush=True)

    # ---- aguada: el color real de la foto, suavizado y posterizado
    col = base.copy()
    for _ in range(3):
        col = cv2.bilateralFilter(col, 9, 40, 12)
    lab = cv2.cvtColor(col, cv2.COLOR_BGR2LAB).astype(np.float32)
    Lq = np.round(lab[..., 0] / 32.0) * 32.0
    lab[..., 0] = 0.55 * lab[..., 0] + 0.45 * Lq
    lab[..., 1:] = 128 + (lab[..., 1:] - 128) * 1.25
    sk_sel = lab[..., 0][skin > 0.7]
    p90 = np.percentile(sk_sel, 90)
    lab[..., 0] = np.clip(lab[..., 0] * (200.0 / max(p90, 1)), 0, 255)
    rgb = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)
    gray_c = rgb.mean(2, keepdims=True)
    ag = np.zeros((H, W, 4), np.float32)
    fd = fade * np.broadcast_to(np.clip((1300 - yy) / 260.0, 0.0, 1), (H, W))
    # piel: rampa de moreno calido + variacion real de la foto
    Ls = cv2.GaussianBlur(np.clip((lab[..., 0] - 40) / 190.0, 0, 1), (0, 0), 5)
    t = np.clip(0.15 + Ls * 0.95, 0, 1)
    ramp = skin_ramp(t, name == "viejo")
    chroma = rgb - gray_c
    cm = (chroma * skin[..., None]).sum((0, 1)) / (skin.sum() + 1e-6)
    skin_rgb = np.clip(ramp + 0.9 * (chroma - cm) * (0.8 if name != "viejo" else 0.5), 0, 255)
    alpha_skin = {"nino": 0.72, "muerte": 0.14, "viejo": 0.7}.get(name, 0.85)
    if name == "muerte":
        skin_rgb = skin_rgb * 0.3 + 255 * 0.7
    wash_img(ag, skin, skin_rgb, alpha_skin, seed + 30, amp=7, mod=fd)
    # labios: tono real de la foto, un poco mas vivo
    lips = warp.apply(ell(mp(M, [MOUTH])[0], (int(62 * S6), int(22 * S6)), -8, 4), cv2.INTER_LINEAR) * skin
    lr = np.clip(rgb * np.array([1.0, 0.8, 0.8]), 0, 255)
    wash_img(ag, lips, lr, 0.22 if name != "muerte" else 0.06, seed + 33, amp=3)
    # pelo y cejas
    hr = 255 - (255 - rgb) * 0.8
    if name == "viejo":
        gr = np.full_like(hr, 188.0)
        hr = hr * 0.35 + gr * 0.65
        hair_alpha = 0.5
    elif name == "muerte":
        hr = hr * 0.4 + 255 * 0.6
        hair_alpha = 0.3
    else:
        hair_alpha = 0.7
    wash_img(ag, hair_m, hr, hair_alpha, seed + 34, amp=4, mod=0.65 + 0.5 * Dh)
    bm = np.zeros((H, W), np.float32)
    for pts in (BROW_L, BROW_R):
        cv2.polylines(bm, [np.array(mp(M, pts), np.int32)], False, 1.0, int(17 * S6))
    bm = cv2.GaussianBlur(warp.apply(bm, cv2.INTER_LINEAR), (0, 0), 3) * skin
    br = np.where(name == "viejo", 0.4 * hr + 0.6 * 190, hr) if name == "viejo" else hr
    wash_img(ag, bm, br, 0.5 if name != "muerte" else 0.1, seed + 36, amp=2)
    # camisa
    sr = 255 - (255 - rgb) * 0.8
    # la camisa solo lleva rayado: sin lavado gris
    # iris real
    if name != "muerte":
        iris_m = np.zeros((H, W), np.float32)
        for e in (EYE_L, EYE_R):
            c = warp_pt(warp, mp(M, [e["iris"]])[0])
            cv2.circle(iris_m, (int(c[0]), int(c[1])), int(e["r"] * S6 * (1.25 if name == "nino" else 1.0)), 1.0, -1)
        iris_m = cv2.GaussianBlur(iris_m * (skin > 0.3), (0, 0), 1.2)
        wash_img(ag, iris_m, np.full_like(rgb, 24.0) * np.array([1.0, 0.72, 0.6], np.float32), 0.88, seed + 37, amp=1.0)
    finalize(name, items, ag)


if __name__ == "__main__":
    ages = sys.argv[1:] or ["nino", "adolescente", "adulto", "viejo", "muerte"]
    for a in ages:
        build(a)
