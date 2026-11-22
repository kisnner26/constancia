#!/usr/bin/env python3
"""
retratos.py: de una foto a un dibujo de trazos (estilo estudio de leonardo, con aguada).

salida por edad en assets/retratos/:
  <edad>.json         lista de trazos [tipo, grosor, x0, y0, dx, dy, ...] (deltas enteros)
  <edad>.png          poster 1200px (papel + aguada + rayado)
  <edad>-aguada.webp  capa de color translucida (rgba, se compone con multiply)

uso: python3 tools/retratos.py [nino adolescente adulto viejo muerte]
las fotos de origen viven en _privado/ref/ y no se publican.
"""
import sys, json, os
import cv2
import numpy as np
from PIL import Image

W, H = 1200, 1500
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "_privado", "ref")
OUT = os.path.join(ROOT, "assets", "retratos")
MAXSTROKES = 8000
INK = np.array([0x1f, 0x3a, 0x6b], np.float32)       # bgr de #6b3a1f
INK_DARK = np.array([0x12, 0x25, 0x4d], np.float32)  # contornos
PAPER = np.array([196, 224, 236], np.float32)         # bgr crema


# ---------------------------------------------------------------- utilidades
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


# ---------------------------------------------------------------- sujetos
def load_a():
    """2.jpg: selfie frontal. devuelve (imagen alineada 1200x1500, landmarks)"""
    im = cv2.imread(os.path.join(REF, "2.jpg"))
    c = (420, 700)
    M = cv2.getRotationMatrix2D(c, 14, 1.45)
    M[0, 2] += 600 - c[0]
    M[1, 2] += 640 - c[1]
    a = cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    lm = dict(eyeL=(478, 658), eyeR=(748, 642), nose=(650, 775), mouth=(690, 872), chin=(700, 1060),
              irisL=(485, 660), irisR=(752, 640))
    return a, lm


def load_b():
    """4.webp: primer plano, mirada baja. se recorta la barra de estado y se encuadra"""
    im = cv2.imread(os.path.join(os.path.dirname(REF) , "ref", "4.png")) if False else None
    pil = Image.open(os.path.join(REF, "4.webp")).convert("RGB")
    im = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)[130:1765]
    M1 = cv2.getRotationMatrix2D((560, 880), 20, 1.0)
    M1[0, 2] += 80
    M1[1, 2] += -180
    # escala 0.74 alrededor de (560,640)
    S = np.array([[0.74, 0, 560 * (1 - 0.74) + 40], [0, 0.74, 640 * (1 - 0.74) + 60], [0, 0, 1]])
    M = (S @ np.vstack([M1, [0, 0, 1]]))[:2]
    a = cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT,
                       borderValue=(236, 224, 196))
    valid = cv2.warpAffine(np.ones(im.shape[:2], np.float32), M, (W, H), flags=cv2.INTER_LINEAR)
    valid = cv2.erode((valid > 0.99).astype(np.float32), np.ones((25, 25), np.uint8))
    return a, valid


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
    with open(path, "w") as f:
        json.dump({"w": W, "h": H, "s": rows}, f, separators=(",", ":"))
    return len(rows)


# ---------------------------------------------------------------- configuracion de zonas (marco de 2.jpg)
FG_A = [(110, 470), (150, 330), (300, 230), (480, 190), (660, 185), (820, 250), (885, 400), (885, 640), (868, 800),
        (845, 920), (815, 1020), (800, 1110), (830, 1170), (900, 1290), (940, 1420), (300, 1420), (330, 1300),
        (340, 1150), (310, 1000), (230, 940), (190, 900), (190, 720), (130, 640)]
HAIR_A = [(105, 480), (200, 285), (420, 195), (650, 183), (835, 255), (890, 430), (880, 615), (815, 590), (790, 520),
          (700, 505), (560, 497), (455, 522), (385, 585), (335, 662), (292, 745), (205, 725), (140, 640)]
SHIRT_A = [(330, 1290), (480, 1420), (940, 1420), (900, 1230), (830, 1170), (700, 1210), (560, 1250), (420, 1250)]


def build_masks_a(img):
    fg = poly(FG_A, 22)
    # desvanece hacia abajo (vineta de estudio)
    yy = np.arange(H, dtype=np.float32)[:, None]
    fade = np.clip((1390 - yy) / 170.0, 0, 1)
    fg = fg * np.broadcast_to(fade, (H, W))
    hair = poly(HAIR_A, 10)
    shirt = poly(SHIRT_A, 8)
    skin = np.clip(fg - hair - shirt, 0, 1)
    return dict(fg=fg, hair=hair, shirt=shirt, skin=skin)


def lips_mask(lm, scale=1.0):
    return ell(lm["mouth"], (int(88 * scale), int(30 * scale)), 3, 5)


def eye_masks(lm, scale=1.0):
    return ell(lm["eyeL"], (int(62 * scale), int(22 * scale)), 6, 4), ell(lm["eyeR"], (int(52 * scale), int(19 * scale)), -6, 4)


# ---------------------------------------------------------------- edades
def make_age(name):
    print("::", name, flush=True)
    seed = sum(map(ord, name)) * 7 + 17
    if name == "muerte":
        return make_death()
    base, lm = load_a()
    masks = build_masks_a(base)
    maskset = dict(masks)
    maskset["lips"] = lips_mask(lm)
    eL, eR = eye_masks(lm)
    maskset["eyes"] = np.clip(eL + eR, 0, 1)
    maskset["irisL"] = ell(lm["irisL"], (20, 20), 0, 2)
    maskset["irisR"] = ell(lm["irisR"], (17, 17), 0, 2)

    warp = Warp()
    extra_D = np.zeros((H, W), np.float32)
    cfg = dict(hatch_layers=3, tone_gamma=1.25, hair_thr=0.18, skin_wash=0.42, hair_rgb=(34, 40, 66), hair_alpha=0.66,
               gray_hair=False, spacing=6.0)

    if name == "nino":
        warp.bulge(lm["eyeL"], 130, 0.38)
        warp.bulge(lm["eyeR"], 120, 0.38)
        warp.shift((610, 650), 230, (0, 46))
        warp.bulge(lm["nose"], 120, -0.32)
        warp.bulge((700, 1040), 210, -0.28)
        warp.bulge((470, 900), 190, 0.22)
        warp.bulge((820, 880), 170, 0.22)
        warp.shift((650, 1000), 260, (0, -30))
        cfg.update(hatch_layers=1, tone_gamma=1.6, skin_wash=0.34, spacing=8.0, hair_thr=0.28)
    elif name == "adulto":
        warp.bulge((345, 985), 160, 0.16)
        warp.bulge((830, 975), 150, 0.14)
        warp.shift((700, 1050), 150, (0, 34))
        warp.bulge(lm["nose"], 120, 0.08)
        cfg.update(hatch_layers=3, tone_gamma=1.15, spacing=5.8)
        extra_D += 0.34 * (blob((490, 705), 42) + blob((745, 690), 38))      # ojeras
        beard = poly([(380, 900), (470, 860), (620, 925), (760, 905), (830, 880), (835, 1010), (790, 1090), (700, 1110),
                      (600, 1100), (440, 1050), (370, 980)], 28)
        extra_D += 0.40 * beard * (0.6 + 0.4 * (snoise((H, W), 3, 7) > 0))
    elif name == "viejo":
        warp.shift((480, 1000), 120, (-6, 22))
        warp.shift((815, 985), 120, (6, 22))
        warp.bulge((470, 790), 110, -0.1)
        warp.bulge((820, 780), 100, -0.1)
        cfg.update(hatch_layers=3, tone_gamma=1.05, skin_wash=0.30, hair_rgb=(150, 150, 158), hair_alpha=0.42,
                   gray_hair=True, spacing=6.0, hair_thr=0.10)

    img = warp.apply(base)
    for k in list(maskset):
        maskset[k] = warp.apply(maskset[k], cv2.INTER_LINEAR)
    fg, hair, skin, lips, eyes = (maskset[k] for k in ("fg", "hair", "skin", "lips", "eyes"))

    if name == "viejo":
        # la linea del pelo retrocede: se pinta la frente en lo que era flequillo
        rec = poly([(470, 420), (560, 380), (700, 375), (800, 420), (835, 540), (700, 505), (560, 497), (480, 520)], 12)
        rec = warp.apply(rec, cv2.INTER_LINEAR)
        skin_col = np.array([128, 150, 190], np.float32)
        img = (img * (1 - rec[..., None]) + skin_col * rec[..., None]).astype(np.uint8)
        hair = np.clip(hair - rec, 0, 1)
        skin = np.clip(fg - hair - maskset["shirt"], 0, 1)

    img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
    D, g = tone_map(img, fg, gamma=cfg["tone_gamma"])
    D = np.clip(D + extra_D, 0, 1)
    D = cv2.GaussianBlur(D, (0, 0), 1.8)
    # el pelo: el borde inferior del flequillo sigue el tono, arriba se rellena entero
    yy_ = np.arange(H, dtype=np.float32)[:, None]
    top = np.broadcast_to(np.clip((470 - yy_) / 60.0, 0, 1), (H, W))
    hair = np.maximum(hair * top, hair * np.clip((cv2.GaussianBlur(D, (0, 0), 3) - 0.30) * 6, 0, 1))
    hair *= np.clip(fg * 1.6, 0, 1)
    # el pelo: oscuro y denso. si es canoso se aclara
    if cfg["gray_hair"]:
        D = np.where(hair > 0.5, D * 0.42, D)
    # la luz del estudio: sombra mas fuerte a la derecha (lado de la nariz)
    flowang = flow_field(g, (600, 230), hair)

    st = Strokes(seed)
    # 1) contornos
    contour_strokes(st, D, np.clip(fg, 0, 1), 0, 2, 0.0, seed, hairmask=hair)
    # 2) rayado diagonal en sombras de piel
    skin_h = np.clip(skin + 0.0, 0, 1)
    sp = cfg["spacing"]
    hatch(st, D, skin_h, 45, sp, 0.14, 0.55, 1, 1, 1.0, seed + 1, chunk=(30, 90))
    if cfg["hatch_layers"] >= 2:
        hatch(st, D, skin_h, 45, sp * 0.6, 0.38, 0.85, 1, 1, 2.0, seed + 2, chunk=(24, 80))
    if cfg["hatch_layers"] >= 3:
        hatch(st, D, skin_h, 78, sp * 0.75, 0.58, 0.95, 1, 1, 3.0, seed + 3, chunk=(14, 44))
    # 3) pelo: trazos que siguen la forma
    trace_hair(st, np.clip(D + 0.1, 0, 1), hair, flowang, 6.0 if not cfg["gray_hair"] else 8.0, cfg["hair_thr"], 2, 1, 1.5, seed + 4)
    hatch(st, D, hair * 0.9, 55, 9, 0.5, 0.95, 2, 1, 2.6, seed + 5, chunk=(18, 50))
    # 4) camisa: solo cuello y pliegues suaves
    hatch(st, D, maskset["shirt"], 45, 12, 0.62, 0.98, 1, 1, 3.5, seed + 6, chunk=(20, 60))

    rng = np.random.default_rng(seed + 20)
    # 5) ojos dibujados a mano (la foto los deja en sombra): parpados, iris, pestanas
    def wpt(p):
        x = int(np.clip(p[0], 0, W - 1))
        y = int(np.clip(p[1], 0, H - 1))
        return (p[0] - warp.dx[y, x], p[1] - warp.dy[y, x])

    eyes_def = (dict(inner=(588, 664), outer=(436, 676), iris=(522, 672), r=17, bow=0.26),
                dict(inner=(692, 641), outer=(786, 624), iris=(738, 634), r=16, bow=0.30))
    eye_poly = np.zeros((H, W), np.float32)
    iris_m = np.zeros((H, W), np.float32)
    for e in eyes_def:
        k = 1.25 if name == "nino" else 1.0
        eye_draw(st, rng, e["inner"], e["outer"], e["iris"], e["r"] * k, e["bow"], wpt, 0.05)
        up, lo = lid_pts(e["outer"], e["inner"], e["bow"]), lid_pts(e["outer"], e["inner"], -e["bow"] * 0.35)
        poly_pts = np.array([wpt(p) for p in up + lo[::-1]], np.int32)
        cv2.fillPoly(eye_poly, [poly_pts], 1.0)
        c = wpt(e["iris"])
        cv2.circle(iris_m, (int(c[0]), int(c[1])), int(e["r"] * k), 1.0, -1)
    maskset["irisL"] = cv2.GaussianBlur(iris_m * eye_poly, (0, 0), 1.2)
    maskset["irisR"] = np.zeros((H, W), np.float32)

    # 6) extras por edad
    if name == "adulto":
        # barba rala: rayado fino corto
        beard = poly([(380, 900), (470, 860), (620, 925), (760, 905), (830, 880), (835, 1010), (790, 1090), (700, 1110),
                      (600, 1100), (440, 1050), (370, 980)], 20)
        beard = warp.apply(beard, cv2.INTER_LINEAR)
        hatch(st, np.clip(D + 0.25, 0, 1), beard * skin, 62, 3.4, 0.35, 0.8, 3, 1, 6.0, seed + 8, chunk=(6, 18))
        for cx in (490, 745):
            for k in range(5):
                st.add(3, 1, 6.5, curve((cx - 55 + k * 4, 718 + k * 3), (cx + 55 - k * 2, 716 + k * 3), 0.18, 10, 0.5, rng))
    if name == "viejo":
        for i in range(5):  # arrugas de la frente
            y = 428 + i * 24
            st.add(3, 1, 6.0, curve((510 + rng.uniform(-14, 14), y), (815 + rng.uniform(-14, 14), y + rng.uniform(-10, 10)), rng.uniform(-0.07, 0.07), 22, 1.6, rng))
        for cx, sgn in ((470, -1), (755, 1)):  # patas de gallo
            for k in range(4):
                a = (-0.35 + k * 0.27)
                st.add(3, 1, 6.2, curve((cx + sgn * 72, 660 + k * 6), (cx + sgn * (130 + k * 4), 650 + (k - 1.5) * 28), 0.08, 8, 0.6, rng))
        for cx, sgn in ((470, -1), (755, 1)):  # bolsas bajo los ojos
            st.add(3, 1, 6.3, curve((cx - 55, 705), (cx + 55, 700), 0.2, 12, 0.5, rng))
            st.add(3, 1, 6.3, curve((cx - 50, 722), (cx + 50, 716), 0.22, 12, 0.5, rng))
        # surcos nasogenianos
        st.add(3, 2, 6.4, curve((580, 800), (520, 900), 0.12, 16, 0.8, rng))
        st.add(3, 2, 6.4, curve((520, 900), (500, 975), 0.1, 12, 0.8, rng))
        st.add(3, 2, 6.4, curve((775, 800), (830, 890), -0.12, 16, 0.8, rng))
        st.add(3, 2, 6.4, curve((830, 890), (845, 960), -0.1, 12, 0.8, rng))
        for k in range(3):  # arrugas de la comisura
            st.add(3, 1, 6.5, curve((560 + k * 8, 905 + k * 12), (500 + k * 8, 925 + k * 14), 0.1, 8, 0.5, rng))
            st.add(3, 1, 6.5, curve((790 - k * 8, 895 + k * 12), (840 - k * 8, 915 + k * 14), -0.1, 8, 0.5, rng))
        for k in range(2):  # entrecejo
            st.add(3, 1, 6.1, curve((600 + k * 18, 565), (598 + k * 22, 612), 0.06, 8, 0.4, rng))

    # limitar
    items = st.items
    if len(items) > MAXSTROKES:
        keep_important = [s for s in items if s[0] in (0, 3, 4)]
        rest = [s for s in items if s[0] not in (0, 3, 4)]
        rng.shuffle(rest)
        items = keep_important + rest[: max(0, MAXSTROKES - len(keep_important))]
    print("   trazos:", len(items), flush=True)

    # ------------------------------------------------ aguada
    ag = np.zeros((H, W, 4), np.float32)
    sk_mod = (0.7 + 0.5 * D) * np.broadcast_to(np.clip((1230 - np.arange(H, dtype=np.float32)[:, None]) / 240.0, 0.15, 1), (H, W))
    wash(ag, skin, (232, 178, 138), cfg["skin_wash"], seed + 30, mod=sk_mod)
    wash(ag, skin * np.clip(D, 0, 1) ** 1.3, (150, 96, 64), 0.5, seed + 31, amp=14, mod=sk_mod)   # sombras tostadas
    cheek = np.clip(blob((470, 840), 70) + blob((810, 820), 60), 0, 1) * skin
    wash(ag, cheek, (214, 120, 104), 0.28 if name != "viejo" else 0.14, seed + 32, amp=16)
    wash(ag, lips, (186, 74, 72), 0.55 if name != "viejo" else 0.3, seed + 33, amp=5)
    wash(ag, hair, cfg["hair_rgb"], cfg["hair_alpha"], seed + 34, amp=5, blotch=0.10, mod=0.55 + 0.7 * D)
    if cfg["gray_hair"]:
        wash(ag, hair * np.clip(D + 0.2, 0, 1), (90, 92, 104), 0.35, seed + 35, amp=8)
        brow = np.clip(blob((470, 590), 55) + blob((750, 575), 55), 0, 1) * skin
        wash(ag, brow, (170, 170, 176), 0.5, seed + 36, amp=5)
    wash(ag, maskset["irisL"] + maskset["irisR"], (84, 48, 26), 0.85, seed + 37, amp=1.5, blotch=0.05)
    wash(ag, maskset["shirt"] * 0.5, (222, 212, 190), 0.25, seed + 38)
    if name == "nino":
        wash(ag, skin, (255, 214, 150), 0.22, seed + 39, amp=18)  # aguada mas luminosa
    return finalize(name, items, ag)


def finalize(name, items, ag):
    os.makedirs(OUT, exist_ok=True)
    n = quantize_export(items, os.path.join(OUT, name + ".json"))
    covs = raster_ink(items)
    pap = paper(11 + len(name))
    img = compose(pap, ag, covs)
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(os.path.join(OUT, name + ".png"), optimize=True)
    rgba = np.clip(ag, 0, 1)
    out = np.dstack([np.clip(ag[..., :3], 0, 255).astype(np.uint8), (rgba[..., 3] * 255).astype(np.uint8)])
    Image.fromarray(out, "RGBA").resize((900, 1125), Image.LANCZOS).save(os.path.join(OUT, name + "-aguada.webp"), quality=78, method=6)
    print("   ok", n, "trazos", flush=True)


# ---------------------------------------------------------------- muerte
def make_death():
    """a partir de 4.webp (mirada baja). se borran los ojos y se dibujan parpados cerrados.
    casi sin color: el dibujo se queda en contorno."""
    base, valid = load_b()
    seed = 991

    def T(p):  # marco de la prealineacion -> marco final
        return (0.74 * p[0] + 185.6, 0.74 * p[1] + 226.4)

    eyes = dict(
        L=dict(outer=(415, 487), inner=(640, 530), c=(527, 510), hw=135, hh=52),
        R=dict(inner=(825, 548), outer=(950, 584), c=(888, 566), hw=100, hh=46),
    )
    # 1) quitar iris y pestanas de la foto
    m = np.zeros((H, W), np.uint8)
    for k in ("L", "R"):
        c = T(eyes[k]["c"])
        cv2.ellipse(m, (int(c[0]), int(c[1])), (int(eyes[k]["hw"] * 0.74), int(eyes[k]["hh"] * 0.74)), 9, 0, 360, 255, -1)
    base = cv2.inpaint(base, m, 9, cv2.INPAINT_TELEA)
    base = cv2.fastNlMeansDenoisingColored(base, None, 8, 8, 7, 21)

    prev_poly = [(0, 0), (1040, 0), (1040, 400), (980, 560), (990, 720), (960, 860), (900, 960), (840, 1060), (780, 1180),
                 (680, 1290), (520, 1300), (380, 1230), (250, 1190), (190, 1120), (160, 900), (120, 720), (0, 720)]
    fg = poly([T(p) for p in prev_poly], 18) * cv2.GaussianBlur(valid, (0, 0), 14)
    yy = np.arange(H, dtype=np.float32)[:, None]
    fg *= np.broadcast_to(np.clip((yy - 226) / 110.0, 0, 1), (H, W))   # el corte superior se desvanece
    hair = poly([T(p) for p in [(0, 0), (1040, 0), (1040, 330), (930, 380), (820, 320), (640, 340), (470, 420), (330, 345),
                                (240, 330), (190, 520), (150, 560), (110, 400), (0, 400)]], 8) * fg
    skin = np.clip(fg - hair, 0, 1)
    lips = poly([T(p) for p in [(560, 985), (700, 960), (860, 985), (880, 1020), (780, 1100), (640, 1090), (570, 1040)]], 5)
    D, g = tone_map(base, fg, hi_p=72, gamma=1.1)
    D = cv2.GaussianBlur(D, (0, 0), 1.8)
    flowang = flow_field(g, (560, 400), hair)

    st = Strokes(seed)
    rng = np.random.default_rng(seed)
    contour_strokes(st, D, fg, 0, 2, 0.0, seed, lo=0.03, hi=0.09, minlen=44)
    hatch(st, D, skin, 45, 10.0, 0.30, 0.75, 1, 1, 1.0, seed + 1, chunk=(30, 80))
    trace_hair(st, np.clip(D + 0.1, 0, 1), hair, flowang, 11.0, 0.35, 2, 1, 1.5, seed + 4, length=(40, 100))
    # rasgos a mano: nariz y labios (el dibujo es contorno)
    feats = [
        [(690, 610), (672, 700), (655, 775), (640, 835)],
        [(640, 838), (700, 866), (770, 872), (850, 822)],
        [(715, 842), (748, 856), (790, 852)],
        [(560, 990), (640, 972), (720, 966), (800, 976), (860, 990)],
        [(575, 1016), (660, 1034), (760, 1030), (872, 1000)],
        [(610, 1042), (690, 1082), (780, 1076), (850, 1040)],
    ]
    for f in feats:
        pts = [T(p) for p in f]
        st.add(0, 2, 0.04, [tuple(np.array(q) + rng.normal(0, 0.8, 2)) for q in pts])
    ident = lambda p: p
    for k in ("L", "R"):
        e = eyes[k]
        eye_draw(st, rng, T(e["inner"]), T(e["outer"]), T(e["c"]), 10, 0.2, ident, 0.05, closed=True)
        # sombra suave del parpado
        a0, a1 = np.array(T(e["outer"])), np.array(T(e["inner"]))
        for t in np.linspace(0.12, 0.9, 9):
            pc = a0 + (a1 - a0) * t + np.array([0, 9 + 5 * np.sin(np.pi * t)])
            st.add(4, 1, 0.06, [tuple(pc + np.array([-9, -3])), tuple(pc + np.array([10, 3]))])
    items = st.items
    if len(items) > MAXSTROKES:
        rng.shuffle(items)
        items = items[:MAXSTROKES]
    print("   trazos:", len(items), flush=True)

    ag = np.zeros((H, W, 4), np.float32)
    wash(ag, skin, (214, 202, 200), 0.20, seed + 30, amp=14, mod=0.6 + 0.6 * D)
    wash(ag, lips, (190, 120, 120), 0.12, seed + 33, amp=5)
    wash(ag, hair, (120, 124, 140), 0.30, seed + 34, amp=6, blotch=0.12, mod=0.5 + 0.7 * D)
    return finalize("muerte", items, ag)


if __name__ == "__main__":
    ages = sys.argv[1:] or ["nino", "adolescente", "adulto", "viejo", "muerte"]
    for a in ages:
        make_age(a)
