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
TAU = 2 * np.pi
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


def finalize(name, items, ag):
    os.makedirs(OUT, exist_ok=True)
    n = quantize_export(items, os.path.join(OUT, name + ".json"))
    covs = raster_ink(items)
    pap = paper(11 + len(name))
    img = compose(pap, ag, covs)
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(os.path.join(OUT, name + ".png"), optimize=True)
    out = np.dstack([np.clip(ag[..., :3], 0, 255).astype(np.uint8), (np.clip(ag[..., 3], 0, 1) * 255).astype(np.uint8)])
    Image.fromarray(out).resize((900, 1125), Image.LANCZOS).save(os.path.join(OUT, name + "-aguada.webp"), quality=78, method=6)
    print("   ok", n, "trazos", flush=True)


# ---------------------------------------------------------------- sujeto: 6.jpg (tres cuartos, buena luz)
def load6(angle=-8.0):
    im = cv2.imread(os.path.join(REF, "6.jpg"))
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


def build(name):
    print("::", name, flush=True)
    seed = sum(map(ord, name)) * 7 + 17
    rng = np.random.default_rng(seed)
    ang = -8.0 if name != "muerte" else -20.0
    base, M = load6(ang)
    base = cv2.fastNlMeansDenoisingColored(base, None, 4, 4, 7, 21)
    Z = zonas(M)
    warp = Warp()
    cfg = dict(gamma=1.1, spacing=3.2, layers=2, hair_alpha=0.78, hair_rgb=(30, 36, 62), gray=False, wash=0.30)
    extra_D = np.zeros((H, W), np.float32)
    lm = {k: mp(M, [v])[0] for k, v in dict(eyeL=EYE_L["iris"], eyeR=EYE_R["iris"], nose=(550, 395), chin=(540, 600),
                                             jawL=(305, 490), jawR=(655, 520), chkL=(365, 430), chkR=(650, 420)).items()}
    if name == "nino":
        warp.bulge(lm["eyeL"], 125, 0.40)
        warp.bulge(lm["eyeR"], 115, 0.40)
        warp.shift(((lm["eyeL"][0] + lm["eyeR"][0]) / 2, lm["eyeL"][1]), 230, (0, 42))
        warp.bulge(lm["nose"], 120, -0.30)
        warp.bulge(lm["chin"], 200, -0.30)
        warp.bulge(lm["chkL"], 170, 0.22)
        warp.bulge(lm["chkR"], 170, 0.22)
        warp.shift(lm["chin"], 240, (0, -28))
        cfg.update(layers=1, gamma=1.5, wash=0.24, spacing=4.8)
    elif name == "adulto":
        warp.bulge(lm["jawL"], 150, 0.14)
        warp.bulge(lm["jawR"], 150, 0.14)
        warp.shift(lm["chin"], 150, (0, 26))
        cfg.update(layers=2, gamma=1.05)
        extra_D += 0.22 * (blob(mp(M, [(430, 330)])[0], 40) + blob(mp(M, [(612, 292)])[0], 36))
    elif name == "viejo":
        warp.shift(mp(M, [(380, 540)])[0], 110, (-5, 20))
        warp.shift(mp(M, [(640, 540)])[0], 110, (5, 20))
        cfg.update(layers=2, gamma=1.0, wash=0.24, hair_rgb=(160, 160, 168), hair_alpha=0.42, gray=True)
    elif name == "muerte":
        cfg.update(layers=1, gamma=1.1)

    # ojos cerrados (muerte): borra iris y pestanas de la foto
    if name == "muerte":
        m = np.zeros((H, W), np.uint8)
        for e in (EYE_L, EYE_R):
            c = mp(M, [e["iris"]])[0]
            cv2.ellipse(m, (int(c[0]), int(c[1])), (int(60 * 1.45), int(24 * 1.45)), -8, 0, 360, 255, -1)
        base = cv2.inpaint(base, m, 8, cv2.INPAINT_TELEA)

    img = warp.apply(base)
    for k in list(Z):
        Z[k] = warp.apply(Z[k], cv2.INTER_LINEAR)
    fg, hair, lips = Z["fg"], Z["hair"], Z["lips"]
    # retroceso del pelo en el viejo: la frente sube
    if name == "viejo":
        rec = poly(mp(M, [(330, 215), (400, 150), (500, 90), (580, 50), (660, 70), (700, 130), (660, 190), (560, 150), (460, 195)]), 8)
        rec = warp.apply(rec, cv2.INTER_LINEAR)
        piel = np.array([140, 168, 205], np.float32)
        img = (img * (1 - rec[..., None]) + piel * rec[..., None]).astype(np.uint8)
        hair = np.clip(hair - rec, 0, 1)

    D, g = tone_map(img, fg, hi_p=90, gamma=cfg["gamma"])
    D = np.clip(D + extra_D, 0, 1)
    if name in ('adolescente', 'nino'):
        low = np.broadcast_to(np.clip((np.arange(H, dtype=np.float32)[:, None] - mp(M, [(0, 520)])[0][1]) / 120.0, 0, 1), (H, W))
        D = D * (1 - 0.45 * low)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    # el pelo real: oscuro dentro de la zona
    hair_dark = np.clip((75 - cv2.GaussianBlur(gray, (0, 0), 2.0)) / 25.0, 0, 1)
    force = warp.apply(poly(mp(M, [(100, -400), (800, -400), (800, 45), (100, 45)]), 10), cv2.INTER_LINEAR)
    out_ = np.clip(cv2.GaussianBlur(warp.apply(OUTSIDE, cv2.INTER_LINEAR), (0, 0), 6) * 1.5, 0, 1)
    hair_m = np.clip(hair * np.maximum(hair_dark, np.maximum(force, out_)), 0, 1)
    hair_m = cv2.GaussianBlur(hair_m, (0, 0), 2.0)
    if name == "viejo":
        hair_m = np.clip(hair_m - rec, 0, 1)
    skin = np.clip(fg - hair_m, 0, 1)
    Dh = np.maximum(D, force * 0.85)
    if cfg["gray"]:
        Dh = np.where(hair_m > 0.5, D * 0.5, D)
    crown = mp(M, [(420, -120)])[0]
    flow = flow_field(g, crown, hair_m, sigma=9)

    st = Strokes(seed)
    # 1) contornos finos
    contour_strokes(st, D, np.clip(fg, 0, 1), 0, 1, 0.0, seed, lo=0.05, hi=0.14, minlen=55, hairmask=hair_m, hair_skip=0.5)
    # 2) rayado de leonardo: paralelo, fino, de abajo-izquierda a arriba-derecha
    A = -55
    sp = cfg["spacing"]
    hatch(st, D, skin, A, sp, 0.16, 0.85, 1, 1, 1.0, seed + 1, chunk=(22, 64))
    if cfg["layers"] >= 2:
        hatch(st, D, skin, A + 70, sp * 1.3, 0.50, 0.98, 1, 1, 2.0, seed + 2, chunk=(16, 44))
    # 3) pelo
    trace_hair(st, np.clip(Dh + 0.15, 0, 1), hair_m, flow, 7.0 if not cfg["gray"] else 9.0, 0.30, 2, 1, 1.5, seed + 4, length=(45, 115))
    hatch(st, Dh, hair_m, A, 5.0, 0.55, 0.98, 2, 1, 2.5, seed + 5, chunk=(40, 110))
    # 4) cejas gruesas y rectas, parpados finos
    brow_strokes(st, M, BROW_L, rng)
    brow_strokes(st, M, BROW_R, rng, n=55)
    eyes_poly = np.zeros((H, W), np.float32)
    iris_m = np.zeros((H, W), np.float32)
    for e in (EYE_L, EYE_R):
        if name == "muerte":
            p0, p1 = mp(M, [e["outer"]])[0], mp(M, [e["inner"]])[0]
            lid = lid_pts(p0, p1, -0.13)
            st.add(4, 1, 0.06, lid)
            n = len(lid)
            for i in range(int(n * 0.05), int(n * 0.65), 2):
                p, q = np.array(lid[i]), np.array(lid[min(n - 1, i + 1)])
                d = q - p
                nrm = np.array([-d[1], d[0]]) / (np.linalg.norm(d) + 1e-6)
                if nrm[1] < 0:
                    nrm = -nrm
                st.add(4, 1, 0.07, [tuple(p), tuple(p + nrm * rng.uniform(5, 9) + d * 0.6)])
            continue
        lid_line(st, M, e, rng)
        # iris oscuro: relleno con rayado corto (sin aro)
        c = np.array(warp_pt(warp, mp(M, [e["iris"]])[0]))
        rr = e["r"] * 1.45 * (1.25 if name == "nino" else 1.0)
        for k in range(14):
            a0 = rng.uniform(0, TAU)
            rad = rr * np.sqrt(rng.uniform(0.05, 1))
            q = c + rad * np.array([np.cos(a0), np.sin(a0)])
            st.add(4, 1, 0.09, [tuple(q - np.array([2.0, -3.5]) * 1.3), tuple(q + np.array([2.0, -3.5]) * 1.3)])
        cv2.circle(iris_m, (int(c[0]), int(c[1])), int(rr), 1.0, -1)
        up = [(x_, y_ + 11) for x_, y_ in (warp_pt(warp, p) for p in lid_pts(mp(M, [e["outer"]])[0], mp(M, [e["inner"]])[0], e["bow"]))]
        lo = [warp_pt(warp, p) for p in lid_pts(mp(M, [e["outer"]])[0], mp(M, [e["inner"]])[0], -0.08)]
        cv2.fillPoly(eyes_poly, [np.array(up + lo[::-1], np.int32)], 1.0)
    iris_m = cv2.GaussianBlur(iris_m * eyes_poly, (0, 0), 1.2)

    # 4b) contornos de rostro, nariz y boca: trazo fino e interrumpido, como un estudio
    def trazo_roto(pts, n=18, w=1, order=0.03, typ=0):
        q = mp(M, pts)
        P_ = np.array(q, np.float32)
        t_ = np.linspace(0, 1, len(P_))
        tt = np.linspace(0, 1, n * len(P_))
        xs = np.interp(tt, t_, P_[:, 0]) + rng.normal(0, 0.5, len(tt))
        ys = np.interp(tt, t_, P_[:, 1]) + rng.normal(0, 0.5, len(tt))
        i = 0
        while i < len(tt) - 3:
            L_ = int(rng.uniform(10, 28))
            seg = [(xs[k], ys[k]) for k in range(i, min(len(tt), i + L_), 3)]
            st.add(typ, w, order, seg)
            i += L_ + int(rng.uniform(0, 4))
    if name != "muerte":
        for pts in ([(292, 470), (322, 512), (360, 550), (420, 598), (480, 628), (540, 640)],
                    [(694, 330), (692, 420), (676, 500), (650, 575), (610, 635)],
                    [(210, 332), (203, 380), (222, 440), (248, 466)],
                    [(520, 312), (528, 350), (524, 392), (512, 414)],
                    [(596, 318), (606, 360), (608, 396), (600, 416)],
                    [(513, 416), (538, 429), (570, 430), (602, 414)],
                    [(534, 388), (556, 381), (583, 392)],
                    [(528, 499), (562, 495), (600, 500), (646, 490)],
                    [(536, 514), (584, 530), (638, 508)]):
            trazo_roto(pts)

    # 5) extras por edad
    if name == "adulto":
        beard = poly(mp(M, [(310, 480), (380, 500), (470, 545), (520, 548), (600, 530), (655, 500), (672, 470), (672, 540),
                            (640, 600), (560, 645), (450, 628), (380, 585), (335, 532)]), 14)
        beard = warp.apply(beard, cv2.INTER_LINEAR) * skin
        beard_D = np.clip(D * 0.4 + 0.5 * beard, 0, 1)
        hatch(st, beard_D, beard, -68, 2.8, 0.18, 0.7, 3, 1, 6.0, seed + 8, chunk=(5, 13))
        hatch(st, beard_D, beard, -40, 3.4, 0.45, 0.8, 3, 1, 6.1, seed + 9, chunk=(5, 11))
        for cx, cy in ((430, 336), (612, 296)):
            for k in range(4):
                a, b = mp(M, [(cx - 50, cy + k * 3), (cx + 46, cy + k * 3 - 6)])
                st.add(3, 1, 6.5, curve(a, b, 0.12, 10, 0.4, rng))
    if name == "viejo":
        for i in range(5):
            y = 98 + i * 24
            a, b = mp(M, [(395 + rng.uniform(-10, 10), y + 8), (655 + rng.uniform(-10, 10), y - 8 + rng.uniform(-4, 4))])
            st.add(3, 1, 6.0, curve(a, b, rng.uniform(-0.04, 0.04), 24, 0.9, rng))
        for (ox, oy), sgn in (((375, 316), -1), ((658, 255), 1)):
            for k in range(4):
                a, b = mp(M, [(ox + sgn * 8, oy + (k - 1.5) * 6), (ox + sgn * (52 + k * 4), oy + (k - 1.5) * 22)])
                st.add(3, 1, 6.2, curve(a, b, 0.06, 8, 0.5, rng))
        for cx, cy, w in ((432, 334, 52), (607, 294, 44)):
            for dy in (0, 14):
                a, b = mp(M, [(cx - w, cy + dy), (cx + w, cy + dy - 5)])
                st.add(3, 1, 6.3, curve(a, b, 0.2, 12, 0.5, rng))
        for pts in ([(522, 418), (492, 470), (484, 522)], [(600, 428), (648, 474), (662, 524)]):
            q = mp(M, pts)
            st.add(3, 1, 6.4, curve(q[0], q[1], 0.1, 14, 0.7, rng))
            st.add(3, 1, 6.4, curve(q[1], q[2], 0.08, 12, 0.7, rng))
        for k in range(2):
            a, b = mp(M, [(418 + k * 14, 226), (420 + k * 16, 252)])
            st.add(3, 1, 6.1, curve(a, b, 0.05, 8, 0.4, rng))
    if name == "muerte":
        # contorno de nariz y labios a mano, muy tenue
        for pts in ([(560, 300), (552, 350), (540, 395)], [(515, 410), (548, 422), (582, 412)],
                    [(525, 498), (565, 486), (610, 487), (645, 495)], [(530, 510), (585, 524), (640, 500)],
                    [(545, 518), (590, 540), (632, 515)]):
            q = mp(M, pts)
            st.add(0, 1, 0.04, [tuple(np.array(c_) + rng.normal(0, 0.6, 2)) for c_ in q])

    items = st.items
    if name == "muerte":
        items = [s_ for s_ in items if not (s_[0] in (1, 2) and rng.random() < 0.55)]
    if len(items) > MAXSTROKES:
        keep = [s_ for s_ in items if s_[0] in (0, 3, 4)]
        rest = [s_ for s_ in items if s_[0] not in (0, 3, 4)]
        rng.shuffle(rest)
        items = keep + rest[: max(0, MAXSTROKES - len(keep))]
    print("   trazos:", len(items), flush=True)

    # ---- aguada (suave, sin manchas)
    ag = np.zeros((H, W, 4), np.float32)
    fade = np.broadcast_to(np.clip((1180 - np.arange(H, dtype=np.float32)[:, None]) / 260.0, 0.1, 1), (H, W))
    Ds = cv2.GaussianBlur(D, (0, 0), 6)
    if name == "muerte":
        wash(ag, skin, (214, 204, 202), 0.16, seed + 30, amp=8, mod=fade, blotch=0.06)
        wash(ag, hair_m, (120, 124, 140), 0.26, seed + 34, amp=5, blotch=0.06, mod=0.5 + 0.7 * Dh)
        wash(ag, lips, (190, 120, 120), 0.12, seed + 33, amp=3)
    else:
        wash(ag, skin, (236, 190, 150), cfg["wash"], seed + 30, amp=7, mod=fade * (0.8 + 0.4 * Ds), blotch=0.06)
        wash(ag, skin * np.clip(Ds, 0, 1) ** 1.4, (170, 120, 90), 0.34, seed + 31, amp=3, mod=fade, blotch=0.04)
        cheek = np.clip(blob(lm["chkL"], 60) + blob(lm["chkR"], 55), 0, 1) * skin
        wash(ag, cheek, (222, 130, 112), 0.09 if name != "viejo" else 0.05, seed + 32, amp=10, blotch=0.04)
        wash(ag, lips, (188, 84, 80), 0.34 if name != "viejo" else 0.22, seed + 33, amp=3, blotch=0.04)
        wash(ag, hair_m, cfg["hair_rgb"], cfg["hair_alpha"], seed + 34, amp=4, blotch=0.06, mod=0.6 + 0.6 * Dh)
        bm = np.zeros((H, W), np.float32)
        for pts in (BROW_L, BROW_R):
            cv2.polylines(bm, [np.array(mp(M, pts), np.int32)], False, 1.0, int(17 * 1.45))
        bm = cv2.GaussianBlur(warp.apply(bm, cv2.INTER_LINEAR), (0, 0), 3) * skin
        wash(ag, bm, (40, 40, 56) if not cfg["gray"] else (150, 150, 158), 0.55 if not cfg["gray"] else 0.4, seed + 36, amp=2, blotch=0.04)
        wash(ag, iris_m, (70, 40, 22), 0.7, seed + 37, amp=1.0, blotch=0.03)
    finalize(name, items, ag)


def warp_pt(warp, p):
    x = int(np.clip(p[0], 0, W - 1))
    y = int(np.clip(p[1], 0, H - 1))
    return (p[0] - warp.dx[y, x], p[1] - warp.dy[y, x])


if __name__ == "__main__":
    ages = sys.argv[1:] or ["nino", "adolescente", "adulto", "viejo", "muerte"]
    for a in ages:
        build(a)
