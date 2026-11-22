// shaders propios (webgl2). todo se dibuja con codigo: torres en la niebla, ojo fractal, amanecer con lente gravitacional.
const CABECERA = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;
out vec4 o;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= .5; } return s; }
`;

// ------------------------------------------------------------------ 2am: la pantalla del portatil
export const TORRES = CABECERA + `
uniform vec2 uA, uB, uC, uD;   // esquinas de la pantalla en px (y hacia abajo): sup-izq, sup-der, inf-der, inf-izq
uniform float uGlow;
float cross2(vec2 a, vec2 b){ return a.x * b.y - a.y * b.x; }
vec2 invBilinear(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d){
  vec2 e = b - a, f = d - a, g = a - b + c - d, h = p - a;
  float k2 = cross2(g, f), k1 = cross2(e, f) + cross2(h, g), k0 = cross2(h, e);
  float u, v;
  if (abs(k2) < 1e-3){ v = -k0 / k1; }
  else {
    float w = k1 * k1 - 4. * k0 * k2;
    if (w < 0.) return vec2(-1.);
    w = sqrt(w);
    float v1 = (-k1 - w) / (2. * k2), v2 = (-k1 + w) / (2. * k2);
    v = (v1 > 0. && v1 < 1.) ? v1 : v2;
  }
  u = (h.x - f.x * v) / (e.x + g.x * v);
  if (v < 0. || v > 1. || u < 0. || u > 1.) return vec2(-1.);
  return vec2(u, v);
}

vec4 torre(vec2 p, float xl0, float xl1, float xr0, float xr1, float ytop, float seed, float t){
  float k = clamp(p.y / ytop, 0., 1.);
  float xl = mix(xl0, xl1, k), xr = mix(xr0, xr1, k);
  if (p.x < xl || p.x > xr || p.y > ytop || p.y < -.05) return vec4(0.);
  float u = (p.x - xl) / (xr - xl);
  vec2 cell = vec2(u * 15., p.y * 70. * (1. - .4 * k));
  vec2 id = floor(cell), fr = fract(cell);
  float lit = step(.80, hash(id + seed));
  float w = step(.2, fr.x) * step(fr.x, .75) * step(.25, fr.y) * step(fr.y, .78);
  float parp = step(.985, hash(id * 1.7 + seed + floor(t * .15)));
  vec3 wc = mix(vec3(1., .74, .40), vec3(.62, .76, 1.), step(.92, hash(id + seed * 3.)));
  float a = (lit + parp) * w * (.55 + .45 * hash(id + 9.));
  vec3 base = vec3(.014, .011, .016) * (.5 + 1.2 * u * u);
  return vec4(base + wc * a * .9, 1.);
}

vec3 coronas(vec2 p, float xl1, float xr1, float ytop, float seed){
  vec3 c = vec3(0.);
  for (int i = 0; i < 16; i++){
    float f = (float(i) + .5) / 16.;
    vec2 q = vec2(mix(xl1, xr1, f), ytop - .004 - .02 * pow(abs(f - .5) * 2., 2.));
    float d = length(p - q);
    c += vec3(1., .84, .58) * (.00018 / (d * d + .00012)) * (.6 + .4 * hash(vec2(float(i), seed)));
  }
  float d2 = length((p - vec2((xl1 + xr1) * .5, ytop)) * vec2(1., 2.4));
  c += vec3(.55, .38, .20) * exp(-d2 * 3.6) * .8;
  return c;
}

vec3 escena(vec2 uv, float asp, float t){
  vec2 p = vec2((uv.x - .5) * asp, 1. - uv.y);
  vec3 col = mix(vec3(.010, .007, .011), vec3(.075, .048, .036), smoothstep(.0, 1.05, p.y) * .85);
  col += vec3(.16, .11, .07) * exp(-pow(length((p - vec2(.05, .88)) * vec2(.9, 1.5)), 2.) * 4.) * .7;
  vec3 fogc = vec3(.30, .21, .14);
  // torre lejana (derecha), media, y la grande
  vec4 t3 = torre(p, .46, .36, .78, .52, .66, 7., t);
  float f3 = .55 + .35 * smoothstep(.3, .66, p.y);
  if (t3.a > 0.) col = mix(t3.rgb, fogc * .5, f3 * .82);
  col += coronas(p, .36, .52, .66, 3.) * .35;
  vec4 t2 = torre(p, .06, .08, .58, .40, .80, 3., t);
  float f2 = .25 + .5 * smoothstep(.25, .8, p.y);
  if (t2.a > 0.) col = mix(t2.rgb, fogc * .6, f2 * .8);
  col += coronas(p, .08, .40, .80, 1.) * .5;
  vec4 t1 = torre(p, -.82, -.44, -.06, -.12, .92, 11., t);
  float f1 = .08 + .6 * smoothstep(.35, .92, p.y);
  if (t1.a > 0.) col = mix(t1.rgb, fogc * .55, f1 * .82);
  col += coronas(p, -.44, -.12, .92, 5.) * .75;
  // niebla que respira
  float n = fbm(p * vec2(2.2, 1.6) + vec2(t * .02, t * .015));
  col += fogc * smoothstep(.25, 1., p.y) * n * .35;
  col += fogc * .25 * exp(-p.y * 2.) * (.4 + n * .6);
  // farol (izquierda)
  vec2 a = vec2(-.62, -.02), b = vec2(-.55, .24);
  vec2 pa = p - a, ba = b - a;
  float hh = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  float dp = length(pa - ba * hh);
  col += vec3(.30) * smoothstep(.0045, .0015, dp) * .6;
  float dl = length(p - b);
  col += vec3(.78, .86, 1.) * (.0003 / (dl * dl + .00025)) + vec3(.35, .45, .7) * exp(-dl * 9.) * .25;
  // luz roja lejana
  vec2 r0 = vec2(.34, .30), r1 = vec2(.46, .27);
  vec2 pr = p - r0, br = r1 - r0;
  float hr = clamp(dot(pr, br) / dot(br, br), 0., 1.);
  float dr = length(pr - br * hr);
  col += vec3(1., .12, .08) * (.00005 / (dr * dr + .00004)) * .9 * (.85 + .15 * sin(t * .7));
  // nieve
  float snow = 0.;
  for (int l = 0; l < 3; l++){
    float s = 14. + float(l) * 11.;
    vec2 q = p * vec2(s * .9, s) + vec2(sin(t * .25 + float(l)) * .6 + float(l) * 7., t * (.45 + .28 * float(l)));
    vec2 id = floor(q), f = fract(q) - .5;
    float h = hash(id + float(l) * 13.);
    if (h > .78){
      vec2 off = vec2(hash(id * 2.3) - .5, hash(id * 3.1) - .5) * .55;
      snow += smoothstep(.10, .0, length(f - off)) * (.5 + .5 * h) * (.85 - .22 * float(l));
    }
  }
  col += vec3(.95, .9, .85) * snow * (.25 + .35 * smoothstep(0., .8, p.y)) * .85;
  return col;
}

uniform float uFade;
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 col = vec3(.011, .008, .012);
  vec2 ctr = (uA + uB + uC + uD) * .25;
  float d = length((fc - ctr) / uRes.y);
  col += vec3(.11, .15, .24) * exp(-d * 3.0) * uGlow * .6 + vec3(.06, .04, .03) * exp(-d * 1.1) * .25;
  vec2 uv = invBilinear(fc, uA, uB, uC, uD);
  if (uv.x >= 0.){
    float asp = length(uB - uA) / length(uD - uA);
    vec3 s = escena(uv, asp, uT);
    float ed = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));
    s *= .75 + .25 * smoothstep(0., .05, ed);
    s += (hash(fc + uT) - .5) * .018;
    col = s * (.92 + .08 * sin(uT * 2.1));
  }
  o = vec4(col * uFade, 1.);
}`;

// ------------------------------------------------------------------ el ojo
export const OJO = CABECERA + `
uniform vec2 uC;        // centro del ojo (px, y hacia arriba)
uniform float uR;       // radio del iris en px
uniform float uMood;    // 0 frio/miedo ... 1 calido/alegria
uniform float uFade;
const float PI = 3.14159265;
float pn(float ang, float rad, float N){
  float x = ang / (2. * PI) * N + N, i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  float i0 = mod(i, N), i1 = mod(i + 1., N);
  float j = floor(rad), g = fract(rad); g = g * g * (3. - 2. * g);
  return mix(mix(hash(vec2(i0, j)), hash(vec2(i1, j)), f), mix(hash(vec2(i0, j + 1.)), hash(vec2(i1, j + 1.)), f), g);
}
vec3 paleta(float m, float mood){
  vec3 fr = mix(vec3(.01, .05, .28), vec3(.30, .72, 1.), m);
  vec3 ca = mix(vec3(.32, .09, .015), vec3(1., .78, .30), m);
  return mix(fr, ca, mood);
}
vec3 galaxia(vec2 g, float mood){
  float gr = length(g * 1.25), ga = atan(g.y, g.x);
  float arms = pow(.5 + .5 * cos(2. * (ga - 2.7 * log(gr + .06) - uT * .12)), 2.6) * exp(-gr * 2.0);
  float core = exp(-gr * gr * 26.) * 1.3;
  vec3 tone = mix(vec3(.55, .66, 1.), vec3(1., .82, .52), mood);
  vec3 c = tone * (arms * .9 + core);
  float neb = fbm(g * 2.6 + vec2(uT * .02, 3.));
  c += mix(vec3(.10, .12, .45), vec3(.45, .16, .05), mood) * smoothstep(.35, .85, neb) * .55 * exp(-gr * .8);
  vec2 sg = g * 22.;
  vec2 id = floor(sg);
  float h = hash(id);
  if (h > .93) c += vec3(.9, .95, 1.) * smoothstep(.16, .0, length(fract(sg) - .5 + (hash(id + 3.) - .5) * .5)) * (h - .9) * 9.;
  return c;
}
void main(){
  float mood = uMood;
  float fear = 1. - mood;
  vec2 p = gl_FragCoord.xy - uC;
  p += fear * vec2(sin(uT * 47.) + sin(uT * 31.3), sin(uT * 53.) + cos(uT * 37.)) * uR * .004;
  float R = uR * (1. + .10 * mood);
  vec2 q = p / R;
  float r = length(q), a = atan(q.y, q.x);
  // parpados
  float Wx = 3.6;
  float xx = clamp(abs(q.x) / Wx, 0., 1.);
  float arco = 1. - xx * xx;
  float yu = .92 * pow(arco, .8) + .02;
  float yl = -1.12 * pow(arco, .8) - .02;
  bool dentro = abs(q.x) < Wx && q.y < yu && q.y > yl;
  vec3 col;
  if (!dentro){
    float du = q.y - yu, dl = yl - q.y;
    float dist = abs(q.x) < Wx ? max(du, dl) : 1.;
    vec3 piel = vec3(.30, .19, .13) * (.55 + .35 * fbm(q * 1.5 + 4.));
    float diag = abs(fract((q.x * .7 + q.y) * 9.) - .5) * 2.;
    float tr = smoothstep(.55, .9, diag) * (.35 + .5 * smoothstep(0., .8, dist));
    float pli = smoothstep(.88, 1., sin(max(dist, 0.) * 22. + fbm(q * 3.) * 3.)) * exp(-max(dist, 0.) * 1.3);
    col = piel * (1. - tr * .55) * (1. - pli * .55);
    col = mix(col, vec3(.03, .015, .012), smoothstep(.12, .0, dist));
  } else {
    float eu = yu - q.y, el = q.y - yl;
    float borde = min(min(eu, el), (Wx - abs(q.x)) * .6);
    vec3 escl = vec3(.84, .77, .68) * (.28 + .72 * smoothstep(0., .5, borde));
    escl += vec3(.25, .03, .02) * smoothstep(.45, .0, borde) * .25;
    col = escl;
    if (r < 1.){
      float rr = r;
      float fib = pn(a, rr * 5., 44.) * .6 + pn(a, rr * 11. + 3., 88.) * .4;
      float colar = smoothstep(.62, .5, abs(rr - .55) * 1.) * .0;
      vec2 z = q * 1.3;
      float ca = uT * .21;
      vec2 c = vec2(-.79 + .09 * cos(ca), .15 + .06 * sin(ca * 1.3));
      float n = 0.;
      for (int i = 0; i < 64; i++){
        z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
        if (dot(z, z) > 16.) break;
        n += 1.;
      }
      float m = n < 63. ? n - log2(log2(dot(z, z))) + 4. : 0.;
      float mm = fract(m * .045 + .1 * uT * .1 + mood * .2);
      vec3 jc = paleta(mm, mood) * (.5 + .9 * smoothstep(0., 20., m));
      vec3 fc = paleta(.25 + .7 * fib, mood) * (.35 + .95 * fib);
      vec3 ic = mix(fc, jc, .52);
      ic *= smoothstep(1., .86, rr) * (.55 + .6 * smoothstep(.35, .62, rr));
      ic += paleta(.9, mood) * exp(-pow((rr - .46) * 9., 2.)) * .35;
      ic *= smoothstep(.0, .22, eu) * .75 + .25;
      col = ic;
      float rp = .34 + .10 * fear;
      if (rr < rp){
        vec2 g = q / rp;
        vec3 gc = galaxia(g, mood);
        gc *= smoothstep(1., .82, length(g));
        col = mix(vec3(.004, .004, .012), vec3(.004, .004, .012) + gc, smoothstep(rp, rp * .96, rr) * 0. + 1.);
        col = mix(col, ic, smoothstep(rp * .93, rp, rr));
      }
    }
    // brillos
    vec2 gq = q - vec2(-.42, .46);
    float v = smoothstep(.17, .10, max(abs(gq.x) * .9, abs(gq.y) * 1.2));
    col += vec3(.95, .97, 1.) * v * .35 * step(r, 1.);
    col += vec3(1.) * smoothstep(.05, .0, length(q - vec2(.28, -.32))) * .22 * step(r, 1.);
  }
  float vig = 1. - .5 * pow(length((gl_FragCoord.xy - uRes * .5) / uRes), 2.) * 2.;
  col *= vig;
  col += (hash(gl_FragCoord.xy + uT) - .5) * .02;
  o = vec4(col * uFade, 1.);
}`;

// ------------------------------------------------------------------ el horizonte: lente gravitacional
export const HORIZONTE = CABECERA + `
uniform float uRise;    // 0..1 el cuerpo oscuro y el sol suben
uniform float uSol;     // 1 vivo ... 0 apagado
uniform float uFade;
float yh(float x){ return -.17 + .012 * fbm(vec2(x * 3.2 + 1., 2.)) + .01 * fbm(vec2(x * 11., 5.)); }

vec3 cielo(vec2 q, vec2 S, float rise){
  float h = q.y + .17;
  vec3 zen = vec3(.012, .018, .06);
  vec3 hor = vec3(.62, .24, .10) * (.25 + 1.1 * rise);
  float g = exp(-max(h, 0.) * 2.8);
  vec3 c = mix(zen, hor, g);
  c += vec3(.12, .06, .22) * exp(-abs(h - .18) * 6.) * rise * .5;
  float d = length(q - S);
  c += vec3(1., .55, .22) * exp(-d * 6.5) * .65 * uSol;
  c += vec3(1., .82, .55) * exp(-d * 22.) * 1.1 * uSol;
  c += vec3(1., .95, .85) * smoothstep(.024, .014, d) * 9. * uSol;
  // estrellas
  vec2 sg = q * 130.;
  float hs = hash(floor(sg));
  c += vec3(.8, .85, 1.) * step(.985, hs) * smoothstep(.3, .0, length(fract(sg) - .5)) * (1. - smoothstep(0., .9, rise)) * .8 * smoothstep(-.1, .3, h);
  return c;
}

void main(){
  vec2 q = (gl_FragCoord.xy - uRes * .5) / uRes.y;
  float rise = uRise;
  vec2 L = vec2(.24, mix(-.30, .17, rise));
  vec2 S = L + vec2(.040, -.026);
  vec2 th = q - L;
  float r = length(th);
  float tE = .165;
  vec3 col;
  float hor = yh(q.x);
  if (q.y > hor){
    // dispersion: tres muestras con deflexion ligeramente distinta
    vec3 acc = vec3(0.);
    for (int k = 0; k < 3; k++){
      float te = tE * (1. + (float(k) - 1.) * .035);
      vec2 beta = th - te * te * th / max(r * r, 1e-4);
      vec3 s = cielo(L + beta, S, rise);
      if (k == 0) acc.r = s.r; else if (k == 1) acc.g = s.g; else acc.b = s.b;
    }
    col = acc;
    float rb = .048;
    float cuerpo = smoothstep(rb, rb * .9, r);
    col = mix(col, vec3(.004, .003, .006), cuerpo);
    col += vec3(1., .72, .4) * exp(-pow((r - rb) * 70., 2.)) * .35 * uSol * (1. - cuerpo);
    // bruma sobre el horizonte
    col += vec3(.9, .45, .22) * exp(-(q.y - hor) * 16.) * (.10 + .25 * rise) * uSol;
  } else {
    float d = hor - q.y;
    vec3 base = vec3(.020, .014, .016) * (1. - .5 * smoothstep(0., .6, d));
    float tex = fbm(vec2(q.x * 6., d * 50. / (d + .25)));
    base *= .6 + .8 * tex;
    vec3 refl = vec3(.75, .32, .12) * exp(-d * 9.) * (.15 + .5 * rise) * uSol;
    // reflejo del sol en la llanura: columna de luz
    float cx = exp(-pow((q.x - S.x) * 5., 2.)) * exp(-d * 3.);
    refl += vec3(1., .6, .3) * cx * .12 * uSol * rise;
    col = base + refl * (.5 + tex);
    col += vec3(.5, .22, .10) * exp(-d * 40.) * .35 * uSol;
  }
  // polvo fino en suspension
  float dust = fbm(q * vec2(5., 8.) + vec2(uT * .03, 0.));
  col += vec3(.6, .35, .2) * dust * .03 * (.3 + rise) * uSol;
  col = 1. - exp(-col * 1.25);
  col = pow(col, vec3(.92));
  col *= 1. - .35 * pow(length(q * vec2(.9, 1.1)), 2.);
  col += (hash(gl_FragCoord.xy + uT) - .5) * .016;
  o = vec4(col * uFade, 1.);
}`;
