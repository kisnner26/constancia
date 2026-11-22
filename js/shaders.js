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
  if (abs(k2) < 1e-6){ v = -k0 / k1; }
  else {
    float w = k1 * k1 - 4. * k0 * k2;
    if (w < 0.) return vec2(-1.);
    w = sqrt(w);
    float v1 = (-k1 - w) / (2. * k2), v2 = (-k1 + w) / (2. * k2);
    if (k1 > 0.) v2 = 2. * k0 / (-k1 - w); else v1 = 2. * k0 / (-k1 + w);
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
  vec2 cell = vec2(u * 24., p.y * 46. * (1. - .4 * k));
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
uniform float uZoom;
uniform vec2 uZC;
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 col = vec3(.011, .008, .012);
  vec2 ctr = (uA + uB + uC + uD) * .25;
  float d = length((fc - ctr) / uRes.y);
  col += vec3(.11, .15, .24) * exp(-d * 3.0) * uGlow * .6 + vec3(.06, .04, .03) * exp(-d * 1.1) * .25;
  vec2 uv = invBilinear(fc, uA, uB, uC, uD);
  if (uv.x >= 0.){
    float asp = length(uB - uA) / length(uD - uA);
    vec2 uvz = (uv - uZC) / max(uZoom, 1.) + uZC;
    vec3 s = escena(uvz, asp, uT);
    float ed = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));
    s *= .75 + .25 * smoothstep(0., .05, ed);
    s += (hash(fc + uT) - .5) * .018;
    col = s * (.92 + .08 * sin(uT * 2.1));
  }
  o = vec4(col * uFade, 1.);
}`;

// ------------------------------------------------------------------ el ojo del personaje: marron muy oscuro, parpado cansado, piel morena
export const OJO = CABECERA + `
uniform vec2 uC;        // centro del ojo (px, y hacia arriba)
uniform float uR;       // radio del iris en px
uniform float uMood;    // 0 frio/miedo ... 1 calido/alegria
uniform float uFade;
uniform float uBlink;
uniform float uJulia;   // 0..1: el fractal aparece dentro del iris y domina
uniform float uPupil;   // 0..1: la pupila se abre hacia la galaxia
const float PI = 3.14159265;
float pn(float ang, float rad, float N){
  float x = ang / (2. * PI) * N + N, i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  float i0 = mod(i, N), i1 = mod(i + 1., N);
  float j = floor(rad), g = fract(rad); g = g * g * (3. - 2. * g);
  return mix(mix(hash(vec2(i0, j)), hash(vec2(i1, j)), f), mix(hash(vec2(i0, j + 1.)), hash(vec2(i1, j + 1.)), f), g);
}
vec3 galaxia(vec2 g, float mood){
  float gr = length(g * 1.25), ga = atan(g.y, g.x);
  float arms = pow(.5 + .5 * cos(2. * (ga - 2.7 * log(gr + .06) - uT * .12)), 2.6) * exp(-gr * 2.0);
  float core = exp(-gr * gr * 26.) * 1.3;
  vec3 tone = mix(vec3(.62, .70, 1.), vec3(1., .80, .50), mood);
  vec3 c = tone * (arms * .9 + core);
  float neb = fbm(g * 2.6 + vec2(uT * .02, 3.));
  c += mix(vec3(.10, .12, .45), vec3(.45, .16, .05), mood) * smoothstep(.35, .85, neb) * .55 * exp(-gr * .8);
  vec2 sg = g * 22.; vec2 id = floor(sg); float h = hash(id);
  if (h > .93) c += vec3(.9, .95, 1.) * smoothstep(.16, .0, length(fract(sg) - .5 + (hash(id + 3.) - .5) * .5)) * (h - .9) * 9.;
  return c;
}
void main(){
  float mood = uMood, fear = 1. - mood;
  vec2 p = gl_FragCoord.xy - uC;
  p += fear * vec2(sin(uT * 47.) + sin(uT * 31.3), sin(uT * 53.) + cos(uT * 37.)) * uR * .004;
  float R = uR * (1. + .08 * mood);
  vec2 q = p / R;
  float r = length(q), a = atan(q.y, q.x);
  // parpados: el superior pesado y caido (mirada cansada)
  float Wx = 3.4;
  float xx = clamp(abs(q.x) / Wx, 0., 1.);
  float arco = 1. - xx * xx;
  float bl = 1. - uBlink;
  float yu = (.58 * pow(arco, .75) + .02) * bl - .9 * uBlink * (1. - arco);
  float yl = (-1.0 * pow(arco, .8) - .02) * bl;
  bool dentro = abs(q.x) < Wx && q.y < yu && q.y > yl;
  vec3 col;
  float du = q.y - yu, dl = yl - q.y;
  if (!dentro){
    float dist = abs(q.x) < Wx ? max(du, dl) : 1.;
    // piel morena con luz calida desde arriba y sombra bajo el parpado
    vec3 piel = mix(vec3(.52, .33, .21), vec3(.66, .44, .30), smoothstep(-.2, 1.6, q.y));
    piel *= .82 + .28 * fbm(q * 2.4 + 4.) ;
    piel = mix(piel, vec3(.20, .11, .07), smoothstep(.55, .0, dist) * (du > 0. ? .8 : .45));
    // pliegue del parpado: una linea fina por encima, mas caida hacia fuera
    float crease = smoothstep(.07, .0, abs(du - .55 - .12 * xx)) * step(0., du) * (1. - smoothstep(.7, 1., xx));
    piel = mix(piel, vec3(.12, .06, .04), crease * .75);
    // pestanas: trazos finos que salen del borde del parpado superior
    float lash = 0.;
    if (du > 0. && abs(q.x) < Wx * .92){
      float cell = q.x * 9. + du * 5.;
      float li = abs(fract(cell) - .5);
      lash = smoothstep(.12, .0, li) * smoothstep(.34, .02, du) * step(.15, hash(vec2(floor(cell), 2.)));
    }
    piel = mix(piel, vec3(.02, .012, .01), clamp(lash, 0., 1.));
    // linea gruesa del borde del parpado
    piel = mix(piel, vec3(.015, .008, .006), smoothstep(.07 + .06 * (1. - xx), .0, abs(du)) * step(du, .02) * 0. + smoothstep(.06, .0, du) * step(0., du) + smoothstep(.04, .0, dl) * step(0., dl) * .6);
    col = piel;
  } else {
    float eu = yu - q.y, el = q.y - yl;
    float borde = min(min(eu, el), (Wx - abs(q.x)) * .6);
    vec3 escl = vec3(.74, .65, .55) * (.2 + .8 * smoothstep(0., .45, borde));
    escl += vec3(.22, .05, .03) * smoothstep(.4, .0, borde) * .3;
    escl += mix(vec3(0., .01, .03), vec3(0.), mood) * fear;
    col = escl;
    if (r < 1.){
      float rr = r;
      float fib = pn(a, rr * 6., 60.) * .55 + pn(a, rr * 14. + 3., 120.) * .45;
      float k = 1.3 - .45 * uJulia;
      vec2 z = q * k;
      float ca = uT * .21;
      vec2 c = vec2(-.79 + .09 * cos(ca), .15 + .06 * sin(ca * 1.3));
      float n = 0.;
      for (int i = 0; i < 64; i++){ z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c; if (dot(z, z) > 16.) break; n += 1.; }
      float m = n < 63. ? n - log2(log2(dot(z, z))) + 4. : 0.;
      float mm = fract(m * .045 + .08 * uT * .1);
      // iris marron muy oscuro, casi negro, con fibras finas y un anillo ambar sutil
      vec3 oscuro = vec3(.040, .020, .012), medio = vec3(.17, .08, .035), ambar = vec3(.62, .33, .09);
      vec3 fc = mix(oscuro, medio, fib * .85) + ambar * exp(-pow((rr - .62) * 6.5, 2.)) * (.10 + .14 * fib) * (.5 + .5 * mood);
      vec3 jpal = mix(vec3(.05, .025, .012), mix(medio * 1.5, ambar * 1.6, smoothstep(.2, .9, mm)), smoothstep(0., 14., m));
      jpal += vec3(1., .72, .34) * pow(smoothstep(.55, 1., mm), 3.) * .5 * uJulia;
      vec3 ic = mix(fc, jpal, .06 + .86 * uJulia);
      ic *= smoothstep(1., .86, rr) * (.55 + .5 * smoothstep(.3, .6, rr));
      ic *= .55 + .45 * smoothstep(0., .5, eu);
      col = ic;
      float rp = mix(.32 + .08 * fear, .94, uPupil);
      if (rr < rp){
        vec2 g = q / rp;
        vec3 gc = galaxia(g, mood) * smoothstep(1., .82, length(g));
        col = mix(vec3(.004, .004, .012) + gc, ic, smoothstep(rp * .93, rp, rr));
      }
    }
    // reflejo de la pantalla del portatil y brillo pequeno
    vec2 gq = q - vec2(-.38, .26);
    float v = smoothstep(.09, .04, max(abs(gq.x) * .9, abs(gq.y) * 1.3));
    col += vec3(.75, .88, 1.) * v * .5 * step(r, 1.) * (1. - uPupil * .7);
    col += vec3(1.) * smoothstep(.05, .0, length(q - vec2(.30, -.26))) * .18 * step(r, 1.) * (1. - uPupil);
    // sombra del parpado sobre el ojo
    col *= .55 + .45 * smoothstep(0., .3, eu);
  }
  float vig = 1. - .5 * pow(length((gl_FragCoord.xy - uRes * .5) / uRes), 2.) * 2.;
  col *= vig;
  col += (hash(gl_FragCoord.xy + uT) - .5) * .018;
  o = vec4(col * uFade, 1.);
}`;

// ------------------------------------------------------------------ el horizonte: lente gravitacional
export const HORIZONTE = CABECERA + `
uniform float uRise;    // 0..1 el cuerpo oscuro y el sol suben
uniform float uSol;     // 1 vivo ... 0 apagado
uniform float uFade;
uniform float uDust;
float yh(float x){
  float giant = .085 * exp(-pow((x - .55 - .12 * sin(uT * .07)) * 2.4, 2.));
  return -.17 + .03 * sin(x * 2.1 + uT * .22) + .014 * sin(x * 5.3 - uT * .37) + .006 * sin(x * 13. + uT * .9) + giant * (.7 + .3 * sin(uT * .15));
}

vec3 cielo(vec2 q, vec2 S, float rise){
  float h = q.y + .17;
  vec3 zen = vec3(.012, .018, .06);
  vec3 hor = vec3(.62, .24, .10) * (.25 + 1.1 * rise);
  float g = exp(-max(h, 0.) * 2.8);
  vec3 c = mix(zen, hor, g);
  c += vec3(.12, .06, .22) * exp(-abs(h - .18) * 6.) * rise * .5;
  // nubes heladas: bandas finas que toman luz del sol por el borde
  float cn = fbm(vec2(q.x * 1.8 + uT * .015, q.y * 6.5));
  float banda = smoothstep(.04, .16, h) * (1. - smoothstep(.42, .7, h));
  float nube = smoothstep(.48, .78, cn) * banda;
  vec3 hielo = mix(vec3(.30, .42, .62), vec3(.95, .80, .66), exp(-length(q - S) * 2.2) * uSol);
  c = mix(c, hielo * (.25 + .9 * rise), nube * .55);
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

uniform float uZ;
uniform float uPan;
void main(){
  vec2 q = (gl_FragCoord.xy - uRes * .5) / uRes.y;
  q = (q - vec2(0., -.17)) / max(uZ, 1.) + vec2(uPan, -.17);
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
    // oceano: swell enorme, brillos en la columna de luz y espuma en la cresta
    float d = hor - q.y;
    vec3 prof = vec3(.006, .014, .026);
    vec3 refl = vec3(.75, .32, .12) * exp(-d * 7.) * (.18 + .55 * rise) * uSol;
    float persp = d / (d + .22);
    float ond = sin(q.x * 9. + uT * .9 + persp * 14.) * .5 + .5;
    float onda2 = fbm(vec2(q.x * 7. + uT * .12, persp * 26. - uT * .5));
    vec3 base = prof * (.6 + .9 * onda2) + refl * (.4 + onda2);
    float col_luz = exp(-pow((q.x - S.x) * (3.4 - 2.2 * persp), 2.));
    float glint = pow(noise(vec2(q.x * 46., persp * 120. - uT * 1.8)), 9.) * 2.6;
    base += vec3(1., .66, .36) * glint * col_luz * (.3 + .9 * rise) * uSol * (1. - persp * .4);
    base += vec3(.55, .6, .75) * pow(ond, 6.) * .02 * persp;
    float cresta = exp(-d * 60.);
    base += vec3(.85, .78, .7) * cresta * (.1 + .5 * rise) * uSol * (.4 + .6 * noise(vec2(q.x * 30., uT * .6)));
    col = base;
    col += vec3(.5, .22, .10) * exp(-d * 40.) * .25 * uSol;
  }
  // polvo fino en suspension
  float dust = fbm(q * vec2(4., 7.) + vec2(uT * .09, 0.));
  col += vec3(.65, .38, .2) * dust * (.03 + .16 * uDust * exp(-abs(q.y + .12) * 2.5)) * (.3 + rise) * (.4 + uSol);
  col = 1. - exp(-col * 1.25);
  col = pow(col, vec3(.92));
  col *= 1. - .35 * pow(length(q * vec2(.9, 1.1)), 2.);
  col += (hash(gl_FragCoord.xy + uT) - .5) * .016;
  o = vec4(col * uFade, 1.);
}`;

// ------------------------------------------------------------------ agujero negro con disco de acrecion lensado (geodesicas nulas de schwarzschild)
export const AGUJERO = CABECERA + `
uniform vec2 uCam;      // giro y cabeceo de la camara
uniform float uDist;    // distancia
uniform float uIgn;     // brillo del disco
uniform float uFade;
float estrellas(vec3 d){
  vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1., 1.))) * vec2(70., 70.);
  vec2 id = floor(sp);
  float h = hash(id);
  float s = step(.987, h) * smoothstep(.45, .0, length(fract(sp) - .5));
  return s * (.4 + .9 * hash(id + 7.));
}
void main(){
  vec2 q = (gl_FragCoord.xy - uRes * .5) / uRes.y;
  float yaw = uCam.x, pit = uCam.y;
  vec3 ro = uDist * vec3(cos(pit) * sin(yaw), sin(pit), -cos(pit) * cos(yaw));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0., 1., 0.), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.5 + rt * q.x + up * q.y);
  vec3 p = ro;
  vec3 col = vec3(0.);
  float opaco = 0.;
  bool cae = false;
  for (int i = 0; i < 190; i++){
    float r = length(p);
    if (r < 1.0){ cae = true; break; }
    vec3 h = cross(p, rd);
    float h2 = dot(h, h);
    float dt = clamp(.045 * r, .03, .7);
    rd += -1.5 * h2 * p / (r * r * r * r * r) * dt;
    rd = normalize(rd);
    vec3 np = p + rd * dt;
    if (p.y * np.y < 0.){
      float f = p.y / (p.y - np.y);
      vec3 hit = mix(p, np, f);
      float hr = length(hit.xz);
      if (hr > 2.7 && hr < 10.){
        float k = (hr - 2.7) / 7.3;
        float temp = pow(1. - k, 1.7);
        vec3 v = normalize(cross(vec3(0., 1., 0.), hit)) * sqrt(.5 / hr);
        float dop = 1. / max(.25, 1. - dot(v, rd));
        float beam = pow(dop, 3.2);
        float ang = atan(hit.z, hit.x) - uT * .9 / pow(hr, 1.5) * 3.;
        float fil = .55 + .45 * sin(ang * 4. + hr * 3.) * sin(ang * 9. - hr * 5.);
        float gr = fbm(vec2(ang * 3., hr * 2.2));
        vec3 c = mix(vec3(1., .30, .06), vec3(1., .86, .58), temp) * temp * beam * (fil * .6 + gr * .6) * 2.4 * uIgn;
        col += c * (1. - opaco);
        opaco = min(1., opaco + .55 * temp + .12);
      }
    }
    p = np;
    if (r > 40.) break;
  }
  if (!cae) col += vec3(.8, .85, 1.) * estrellas(rd) * (1. - opaco) * .8;
  // brillo suave alrededor
  float rq = length(q);
  col += vec3(1., .5, .2) * .02 * uIgn / (rq * rq * 40. + .2);
  col = 1. - exp(-col * 1.3);
  col = pow(col, vec3(.95));
  col += (hash(gl_FragCoord.xy + uT) - .5) * .014;
  o = vec4(col * uFade, 1.);
}`;
