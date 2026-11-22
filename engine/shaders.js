// biblioteca de pases webgl2 del motor. cada pase es un fragment shader autonomo con sus uniforms documentados.
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

// ------------------------------------------------------------------ el ojo del personaje: marron muy oscuro, parpado cansado, piel morena
export const EYE = CABECERA + `
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
      // iris casi negro (#1a1210 a #0d0a09), fibras apenas visibles; el julia emerge como luz desde ese negro
      vec3 oscuro = vec3(.050, .037, .033), medio = vec3(.102, .071, .063);
      vec3 fc = mix(oscuro, medio, fib * .55);
      vec3 luzj = mix(vec3(.95, .42, .10), vec3(1., .92, .72), smoothstep(.5, 1., mm));
      vec3 jpal = luzj * pow(smoothstep(.30, 1., mm), 2.2) * smoothstep(2., 20., m) * 1.5;
      vec3 ic = fc + jpal * uJulia;
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
export const HORIZON = CABECERA + `
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
export const BLACKHOLE = CABECERA + `
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

// ------------------------------------------------------------------ julia: pase minimo reutilizable
export const JULIA = CABECERA + `
uniform vec2 uC;        // parametro c del conjunto
uniform float uZoom;
uniform vec3 uTint;
void main(){
  vec2 z = (gl_FragCoord.xy - uRes * .5) / uRes.y * 3. / max(uZoom, .01);
  float n = 0.;
  for (int i = 0; i < 80; i++){ z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + uC; if (dot(z, z) > 16.) break; n += 1.; }
  float m = n < 79. ? n - log2(log2(dot(z, z))) + 4. : 0.;
  float k = pow(smoothstep(0., 40., m), .6);
  o = vec4(uTint * k * (.6 + .4 * sin(m * .3 + uT)), 1.);
}`;

/** pases incluidos: nombre -> fuente. registrarlos: registerLibrary(gl) */
export const PASSES = { eye: EYE, horizon: HORIZON, blackhole: BLACKHOLE, julia: JULIA };
export function registerLibrary(gl) { for (const k in PASSES) gl.register(k, PASSES[k]); }
