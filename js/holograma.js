// Holograma: el "núcleo" de Jarvis. Una esfera de fragmentos dorados que gira detrás de las pantallas,
// con una red de nodos por donde saltan señales, órbitas que van apareciendo y girando alrededor,
// anillos de medición y un núcleo que late. Es solo adorno: no lee ni guarda datos.
// Se pausa con la pestaña oculta o con una ventana abierta y, si el sistema pide menos movimiento,
// se dibuja una sola vez (quieta). Todo lo que se mueve es función pura del tiempo (no guarda estado),
// así ese cuadro quieto también muestra la red, las señales y las órbitas.
(function () {
  const lienzo = document.getElementById('holo');
  if (!lienzo || !lienzo.getContext) return;
  const ctx = lienzo.getContext('2d');
  const quieto = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TAU = Math.PI * 2;

  // ---------- Ayudas ----------
  // Azar repetible: así la esfera se ve igual en cada carga.
  let semilla = 1101;
  const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
  const entre = (a, b) => a + (b - a) * azar();
  const unitario = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vectorAzar = () => unitario([azar() - .5, azar() - .5, azar() - .5]);
  // Número entre 0 y 1 que siempre es el mismo para el mismo entero (para lo que cambia con el tiempo)
  const hash = n => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const suave = t => t * t * (3 - 2 * t);
  // Listas de trazos en memoria fija (sin basura por cuadro): de 4 números por segmento o 2 por punto
  const lista = (max, paso) => ({ d: new Float32Array(max * paso), n: 0 });
  const poner4 = (l, a, b, c, d) => { if (l.n + 4 <= l.d.length) { l.d[l.n] = a; l.d[l.n + 1] = b; l.d[l.n + 2] = c; l.d[l.n + 3] = d; l.n += 4; } };
  const poner2 = (l, a, b) => { if (l.n + 2 <= l.d.length) { l.d[l.n] = a; l.d[l.n + 1] = b; l.n += 2; } };

  // ---------- Lo que se arma una sola vez ----------
  // El ovillo: anillos de distinto radio e inclinación (más apretados hacia afuera), hechos de trozos cortos y polvo luminoso
  const anillos = [];
  for (let i = 0; i < 22; i++) {
    const n = vectorAzar();                 // perpendicular al plano del anillo
    const u = unitario(cruz(n, vectorAzar()));
    const v = cruz(n, u);
    const trozos = [];
    for (let a = 0; a < TAU;) {
      const largo = entre(.03, .26);
      if (azar() < .82) trozos.push({ a, largo, grueso: azar() < .05 });
      a += largo + entre(.02, .2);
    }
    const polvo = [];
    for (let k = 0; k < 22; k++) polvo.push({ a: azar() * TAU, dr: (azar() - .5) * .08, dz: (azar() - .5) * .08 });
    anillos.push({ r: 1 - .66 * Math.pow(i / 22, 1.5), n, u, v, trozos, polvo, fase: azar() * TAU, w: entre(.05, .25) * (i % 2 ? 1 : -1) });
  }

  // Espiral del núcleo (3 brazos)
  const espiral = [0, 1, 2].map(brazo => {
    const puntos = [];
    for (let k = 0; k < 70; k++) puntos.push({ a: brazo * TAU / 3 + k * .14, r: .03 + Math.pow(k / 70, 1.3) * .3, z: (azar() - .5) * .04 });
    return puntos;
  });

  // Chispas que parpadean
  const chispas = [];
  for (let k = 0; k < 80; k++) {
    const d = vectorAzar(), r = entre(.4, 1.05);
    chispas.push({ x: d[0] * r, y: d[1] * r, z: d[2] * r, f: entre(.8, 2.2), fase: azar() * TAU, tam: entre(.4, 1) });
  }

  // La red: nodos repartidos por la esfera (espiral áurea), cada uno unido a sus 3 vecinos más cercanos
  const N = 28, K = 7;
  const nodos = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    nodos.push(unitario([r * Math.cos(a) + (azar() - .5) * .08, y + (azar() - .5) * .08, r * Math.sin(a) + (azar() - .5) * .08]));
  }
  const enlaces = [], vecinos = nodos.map(() => []), vistos = new Set();
  nodos.forEach((a, i) => {
    nodos.map((b, j) => [j, punto(a, b)]).filter(p => p[0] !== i).sort((p, q) => q[1] - p[1]).slice(0, 3).forEach(([j]) => {
      const clave = Math.min(i, j) * 100 + Math.max(i, j);
      if (!vistos.has(clave)) { vistos.add(clave); enlaces.push([Math.min(i, j), Math.max(i, j)]); }
    });
  });
  enlaces.forEach(([a, b], k) => { vecinos[a].push({ nodo: b, enlace: k, inverso: false }); vecinos[b].push({ nodo: a, enlace: k, inverso: true }); });
  // Cada enlace es un arco pegado a la esfera (interpolación esférica), un poco levantado en el medio
  const arco = enlaces.map(([a, b]) => {
    const A = nodos[a], B = nodos[b];
    const omega = Math.acos(Math.max(-1, Math.min(1, punto(A, B)))), sen = Math.sin(omega) || 1;
    const pts = new Float32Array(K * 3);
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1), f1 = Math.sin((1 - t) * omega) / sen, f2 = Math.sin(t * omega) / sen, r = .98 + .035 * Math.sin(Math.PI * t);
      for (let c = 0; c < 3; c++) pts[k * 3 + c] = (A[c] * f1 + B[c] * f2) * r;
    }
    return pts;
  });
  // Tres señales que recorren la red: cada una salta de nodo en nodo, sin volver sobre sus pasos
  const SALTO = .55, PASOS = 240;
  const caminos = [0, 1, 2].map(() => {
    const pasos = [];
    let nodo = Math.floor(azar() * N), previo = -1;
    for (let j = 0; j < PASOS; j++) {
      const libres = vecinos[nodo].filter(v => v.nodo !== previo), opciones = libres.length ? libres : vecinos[nodo];
      const v = opciones[Math.floor(azar() * opciones.length)];
      pasos.push({ hasta: v.nodo, enlace: v.enlace, inverso: v.inverso });
      previo = nodo; nodo = v.nodo;
    }
    return pasos;
  });

  // Punto de luz suave (se dibuja escalado: cabezas de cometa, nodos, chispas y núcleo)
  const brillo = document.createElement('canvas');
  brillo.width = brillo.height = 64;
  (function () {
    const c = brillo.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,244,205,1)'); g.addColorStop(.25, 'rgba(255,196,80,.55)'); g.addColorStop(1, 'rgba(255,140,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  })();

  // Memoria fija para los trazos de cada cuadro
  const frag = [lista(1000, 4), lista(1000, 4), lista(1000, 4)], baldosas = lista(160, 4), polvo = [lista(800, 2), lista(800, 2), lista(800, 2)];
  const red = [lista(450, 4), lista(450, 4), lista(450, 4)], redActiva = [lista(150, 4), lista(150, 4)], colas = [lista(40, 4), lista(40, 4), lista(40, 4)];
  const nodosAtras = lista(40, 2), nodosFrente = lista(40, 2), orbitas = [0, 1, 2, 3].map(() => lista(300, 4));
  const energia = new Float32Array(enlaces.length), destello = new Float32Array(N);

  // ---------- Movimiento ----------
  // La esfera se inclina un poco hacia el puntero y gira con el desplazamiento de la página.
  let px = 0, py = 0, suaveX = 0, suaveY = 0;
  window.addEventListener('pointermove', e => { px = e.clientX / window.innerWidth - .5; py = e.clientY / window.innerHeight - .5; }, { passive: true });

  function dibujar(ms) {
    const L = lienzo.width;
    if (!L) return;
    const R = L * .33;      // radio de la esfera (el resto del lienzo es para las órbitas y los anillos)
    const u = R / 250;      // unidad de grosor: todo escala con el tamaño
    const s = ms / 1000;
    suaveX += (px - suaveX) * .05; suaveY += (py - suaveY) * .05;
    const giroY = s * .14 + suaveX * 1.2 + (window.pageYOffset || 0) * .0014;
    const giroX = .42 + suaveY * .6;
    const cosY = Math.cos(giroY), senY = Math.sin(giroY), cosX = Math.cos(giroX), senX = Math.sin(giroX);

    // Gira un punto 3D, le da perspectiva y deja el resultado en X, Y (pantalla) y Z (profundidad)
    let X = 0, Y = 0, Z = 0;
    const girar = (x, y, z) => {
      const x1 = x * cosY + z * senY, z1 = z * cosY - x * senY;
      const y1 = y * cosX - z1 * senX, z2 = y * senX + z1 * cosX;
      const k = 3 / (3 - z2 * .9);
      X = x1 * k * R; Y = y1 * k * R; Z = z2;
    };
    const trazar = (l, color, ancho) => {
      if (!l.n) return;
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(.7, ancho);
      ctx.beginPath();
      for (let i = 0; i < l.n; i += 4) { ctx.moveTo(l.d[i], l.d[i + 1]); ctx.lineTo(l.d[i + 2], l.d[i + 3]); }
      ctx.stroke();
    };
    const puntos = (l, color, tam) => {
      ctx.fillStyle = color;
      const lado = Math.max(1, tam);
      for (let i = 0; i < l.n; i += 2) ctx.fillRect(l.d[i] - lado / 2, l.d[i + 1] - lado / 2, lado, lado);
    };
    const luz = (x, y, tam, alfa) => { ctx.globalAlpha = Math.min(1, alfa); ctx.drawImage(brillo, x - tam / 2, y - tam / 2, tam, tam); };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, L, L);
    ctx.translate(L / 2, L / 2);
    ctx.globalCompositeOperation = 'lighter'; // la luz se suma: donde se cruzan los trazos, brilla más

    // Aura y núcleo (degradados: casi no cuestan). El núcleo late y destella cuando sale la onda de pulso.
    const onda = (s % 4) / 4, latido = 1 + .1 * Math.sin(s * 2.1) + .6 * Math.exp(-onda * 10);
    const aura = ctx.createRadialGradient(0, 0, R * .55, 0, 0, R * 1.3);
    aura.addColorStop(0, 'rgba(255,140,20,0)'); aura.addColorStop(.55, 'rgba(255,150,30,.2)'); aura.addColorStop(1, 'rgba(255,120,10,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, TAU); ctx.fill();
    const nucleo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * .85);
    nucleo.addColorStop(0, 'rgba(255,246,215,' + Math.min(1, latido).toFixed(3) + ')');
    nucleo.addColorStop(.1, 'rgba(255,218,125,' + Math.min(1, .7 * latido).toFixed(3) + ')');
    nucleo.addColorStop(.28, 'rgba(255,172,50,' + Math.min(1, .38 * latido).toFixed(3) + ')');
    nucleo.addColorStop(1, 'rgba(255,130,20,0)');
    ctx.fillStyle = nucleo;
    ctx.beginPath(); ctx.arc(0, 0, R * .85, 0, TAU); ctx.fill();

    // --- El ovillo: los trozos se reparten en tres capas de profundidad (fondo, medio, frente) ---
    frag.forEach(l => { l.n = 0; }); baldosas.n = 0; polvo.forEach(l => { l.n = 0; });
    for (const an of anillos) {
      const giro = an.fase + an.w * s;
      const sobreAnillo = (a, dr, dz) => {
        const c = Math.cos(a) * (an.r + dr), sn = Math.sin(a) * (an.r + dr);
        girar(c * an.u[0] + sn * an.v[0] + dz * an.n[0], c * an.u[1] + sn * an.v[1] + dz * an.n[1], c * an.u[2] + sn * an.v[2] + dz * an.n[2]);
      };
      for (const t of an.trozos) {
        const partes = Math.ceil(t.largo / .16);
        sobreAnillo(giro + t.a, 0, 0);
        let x0 = X, y0 = Y, z0 = Z;
        for (let p = 1; p <= partes; p++) {
          sobreAnillo(giro + t.a + t.largo * p / partes, 0, 0);
          const z = (z0 + Z) / 2;
          poner4(t.grueso ? baldosas : frag[z > .3 ? 2 : z > -.3 ? 1 : 0], x0, y0, X, Y);
          x0 = X; y0 = Y; z0 = Z;
        }
      }
      for (const d of an.polvo) { sobreAnillo(giro + d.a, d.dr, d.dz); poner2(polvo[Z > .3 ? 2 : Z > -.3 ? 1 : 0], X, Y); }
    }
    trazar(frag[0], 'rgba(255,128,20,.38)', .95 * u);
    trazar(frag[1], 'rgba(255,176,50,.62)', 1.2 * u);
    trazar(frag[2], 'rgba(255,230,150,.9)', 1.45 * u);
    trazar(baldosas, 'rgba(255,224,140,.95)', 2.2 * u);
    puntos(polvo[0], 'rgba(255,140,30,.55)', 1.2 * u);
    puntos(polvo[1], 'rgba(255,184,64,.85)', 1.5 * u);
    puntos(polvo[2], 'rgba(255,236,170,1)', 1.8 * u);

    // --- La red: las señales (cometas) saltan de nodo en nodo y dejan el camino encendido ---
    energia.fill(0); destello.fill(0);
    colas.forEach(l => { l.n = 0; });
    const cabezas = [];
    caminos.forEach((camino, w) => {
      const t = (s - w * .18) / SALTO;
      if (t < 0) return;
      const salto = Math.floor(t), j = salto % PASOS, p = t - salto, paso = camino[j];
      energia[paso.enlace] = 1;
      if (salto > 0) { // el salto anterior se apaga poco a poco y el nodo al que llegó destella
        const ant = camino[(j + PASOS - 1) % PASOS];
        energia[ant.enlace] = Math.max(energia[ant.enlace], .9 * Math.exp(-p * 2.4));
        destello[ant.hasta] = Math.max(destello[ant.hasta], Math.exp(-p * SALTO / .3));
      }
      const f = suave(p), pts = arco[paso.enlace];
      const sobreArco = fr => { // punto del arco en la fracción fr, en el sentido del recorrido
        const q = (paso.inverso ? 1 - fr : fr) * (K - 1), i0 = Math.min(K - 2, Math.floor(q)), m = q - i0, a = i0 * 3, b = a + 3;
        girar(pts[a] + (pts[b] - pts[a]) * m, pts[a + 1] + (pts[b + 1] - pts[a + 1]) * m, pts[a + 2] + (pts[b + 2] - pts[a + 2]) * m);
      };
      const ini = Math.max(0, f - .5);
      sobreArco(ini);
      let x0 = X, y0 = Y;
      for (let k = 1; k <= 5; k++) { // cola del cometa: cada tramo más brillante que el anterior
        sobreArco(ini + (f - ini) * k / 5);
        poner4(colas[Math.floor((k - 1) * 3 / 5)], x0, y0, X, Y);
        x0 = X; y0 = Y;
      }
      cabezas.push(X, Y, Z);
    });
    const h = .95 * Math.sin(s * .55); // altura del anillo de escaneo (de polo a polo)
    red.forEach(l => { l.n = 0; }); redActiva.forEach(l => { l.n = 0; });
    for (let k = 0; k < enlaces.length; k++) {
      const pts = arco[k], e = energia[k];
      girar(pts[0], pts[1], pts[2]);
      let x0 = X, y0 = Y, z0 = Z;
      for (let i = 1; i < K; i++) {
        girar(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
        poner4(e > .55 ? redActiva[1] : e > .08 ? redActiva[0] : red[(z0 + Z) / 2 > .3 ? 2 : (z0 + Z) / 2 > -.3 ? 1 : 0], x0, y0, X, Y);
        x0 = X; y0 = Y; z0 = Z;
      }
    }
    trazar(red[0], 'rgba(255,150,40,.22)', 1.1 * u);
    trazar(red[1], 'rgba(255,190,70,.4)', 1.2 * u);
    trazar(red[2], 'rgba(255,230,160,.65)', 1.3 * u);
    trazar(redActiva[0], 'rgba(255,200,85,.8)', 1.7 * u);
    trazar(redActiva[1], 'rgba(255,238,175,1)', 2.3 * u);
    trazar(colas[0], 'rgba(255,170,50,.6)', 2 * u);
    trazar(colas[1], 'rgba(255,210,105,.9)', 2.6 * u);
    trazar(colas[2], 'rgba(255,244,200,1)', 3.1 * u);
    nodosAtras.n = 0; nodosFrente.n = 0;
    for (let i = 0; i < N; i++) { // nodos: brillan al recibir una señal y cuando los cruza el anillo de escaneo
      const nd = nodos[i];
      girar(nd[0] * .985, nd[1] * .985, nd[2] * .985);
      const dy = Math.abs(nd[1] - h), f = Math.max(destello[i], dy < .12 ? (1 - dy / .12) * .85 : 0);
      poner2(Z > 0 ? nodosFrente : nodosAtras, X, Y);
      luz(X, Y, (11 + 44 * f) * u, (Z > 0 ? .55 : .28) + f);
    }
    ctx.globalAlpha = 1;
    puntos(nodosAtras, 'rgba(255,170,60,.75)', 2.6 * u);
    puntos(nodosFrente, 'rgba(255,246,205,1)', 3.8 * u);
    const rho = Math.sqrt(Math.max(0, 1 - h * h)) * .985; // anillo de escaneo
    ctx.strokeStyle = 'rgba(255,222,135,.75)'; ctx.lineWidth = Math.max(.8, 1.6 * u);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i * TAU / 40;
      girar(rho * Math.cos(a), h * .985, rho * Math.sin(a));
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.stroke();
    for (let i = 0; i < cabezas.length; i += 3) luz(cabezas[i], cabezas[i + 1], 32 * u, cabezas[i + 2] > 0 ? 1 : .6);
    ctx.globalAlpha = 1;

    // --- Órbitas que aparecen y giran: 9 a la vez, cada una con su ciclo (nace, crece, gira y se desvanece) ---
    orbitas.forEach(l => { l.n = 0; });
    const cabezasOrbita = [];
    for (let i = 0; i < 9; i++) {
      const P = 4.5 + 3.5 * hash(i * 13 + 1);
      const tt = s + P * ((i * .618034 + .13) % 1), c = Math.floor(tt / P), uu = (tt - c * P) / P, b = c * 101 + i * 977; // b: cambia en cada ciclo
      const largo = (1.3 + 1.9 * hash(b + 10)) * suave(Math.min(1, uu / .25));       // el arco crece al nacer
      const alfa = uu < .7 ? 1 : 1 - suave((uu - .7) / .3);                        // y se desvanece al final
      if (largo < .05 || alfa <= 0) continue;
      const nrm = unitario([hash(b + 1) - .5, hash(b + 2) - .5, hash(b + 3) - .5]);
      const ua = unitario(cruz(nrm, [hash(b + 4) - .5, hash(b + 5) - .5, hash(b + 6) - .5])), va = cruz(nrm, ua);
      const radio = 1.08 + .26 * hash(b + 7), w = (hash(b + 8) < .5 ? -1 : 1) * (.55 + .9 * hash(b + 9));
      const estilo = Math.floor(hash(b + 11) * 3);                                  // 0 continua, 1 punteada, 2 segmentada
      const cabeza = hash(b + 12) * TAU + w * uu * P, dir = Math.sign(w), n = Math.max(2, Math.ceil(largo / .12));
      let x0 = 0, y0 = 0, z0 = 0;
      for (let k = 0; k <= n; k++) {
        const a = cabeza - dir * largo * (1 - k / n), cs = Math.cos(a) * radio, sn = Math.sin(a) * radio;
        girar(cs * ua[0] + sn * va[0], cs * ua[1] + sn * va[1], cs * ua[2] + sn * va[2]);
        if (k) {
          const q = (k - .5) / n, visible = estilo === 0 || (estilo === 1 ? k % 2 === 0 : Math.floor(q * 5) % 2 === 0);
          if (visible) poner4(orbitas[Math.min(3, Math.floor(4 * Math.pow(q, 1.2) * alfa * ((z0 + Z) / 2 > 0 ? 1 : .55)))], x0, y0, X, Y);
        }
        x0 = X; y0 = Y; z0 = Z;
      }
      cabezasOrbita.push(X, Y, Z, alfa); // la última posición es la cabeza
    }
    ['rgba(255,140,30,.25)', 'rgba(255,175,55,.5)', 'rgba(255,212,110,.82)', 'rgba(255,244,190,1)']
      .forEach((color, i) => trazar(orbitas[i], color, (i === 3 ? 2.4 : 1.7) * u));
    for (let i = 0; i < cabezasOrbita.length; i += 4) luz(cabezasOrbita[i], cabezasOrbita[i + 1], 24 * u, cabezasOrbita[i + 3] * (cabezasOrbita[i + 2] > 0 ? 1 : .5));
    ctx.globalAlpha = 1;

    // --- Núcleo: espiral que gira rápido, arcos y un punto caliente que late ---
    const giroEsp = s * .9, inclina = .6, cosI = Math.cos(inclina), senI = Math.sin(inclina), finEsp = [];
    ctx.strokeStyle = 'rgba(255,230,160,.85)'; ctx.lineWidth = Math.max(.8, 1.2 * u);
    ctx.beginPath();
    for (const brazo of espiral) {
      brazo.forEach((e, k) => {
        const x = e.r * Math.cos(e.a + giroEsp), y = e.r * Math.sin(e.a + giroEsp);
        girar(x, y * cosI - e.z * senI, y * senI + e.z * cosI);
        if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      finEsp.push(X, Y);
    }
    ctx.stroke();
    for (let i = 0; i < finEsp.length; i += 2) luz(finEsp[i], finEsp[i + 1], 14 * u, .8);
    ctx.strokeStyle = 'rgba(255,238,175,.9)'; ctx.lineWidth = Math.max(1, 1.7 * u);
    ctx.beginPath(); ctx.arc(0, 0, R * .16, s * 2.4, s * 2.4 + 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * .24, -s * 1.7, -s * 1.7 + 1); ctx.stroke();
    luz(0, 0, 90 * u, .85 * latido);

    // --- Chispas ---
    for (const c of chispas) {
      girar(c.x, c.y, c.z);
      const parpadeo = .55 + .45 * Math.sin(s * c.f * 2 + c.fase);
      luz(X, Y, (9 + 20 * c.tam) * u * parpadeo * (.6 + (Z + 1) * .3), .35 + parpadeo * .65);
    }
    ctx.globalAlpha = 1;

    // --- Anillos de medición alrededor: cada uno gira a su ritmo y en su sentido ---
    ctx.strokeStyle = 'rgba(255,176,46,.26)'; ctx.lineWidth = Math.max(.7, u);
    ctx.setLineDash([2 * u, 7 * u]); ctx.lineDashOffset = -s * 6 * u;       // punteado que avanza
    ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,200,95,.6)'; ctx.lineWidth = Math.max(1, 1.8 * u); // cuatro arcos con huecos
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = s * .35 + k * TAU / 4;
      ctx.moveTo(Math.cos(a) * R * 1.17, Math.sin(a) * R * 1.17);
      ctx.arc(0, 0, R * 1.17, a, a + .9);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,180,60,.32)'; ctx.lineWidth = Math.max(.7, u);  // punteado fino con un cursor brillante
    ctx.setLineDash([u, 5 * u]); ctx.lineDashOffset = s * 8 * u;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.24, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,236,170,.95)'; ctx.lineWidth = Math.max(1, 2.2 * u);
    ctx.beginPath(); ctx.arc(0, 0, R * 1.24, -s * .9, -s * .9 + .24); ctx.stroke();
    const activa = Math.floor(s * 14) % 60;                                     // dial de marcas con una marca activa que barre
    ctx.strokeStyle = 'rgba(255,190,90,.34)'; ctx.lineWidth = Math.max(.7, .9 * u);
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      if (i === activa) continue;
      const a = i * TAU / 60 + s * .03, largo = i % 5 === 0 ? .08 : .035;
      ctx.moveTo(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3);
      ctx.lineTo(Math.cos(a) * R * (1.3 + largo), Math.sin(a) * R * (1.3 + largo));
    }
    ctx.stroke();
    const aa = activa * TAU / 60 + s * .03;
    ctx.strokeStyle = 'rgba(255,240,185,1)'; ctx.lineWidth = Math.max(1, 2.2 * u);
    ctx.beginPath(); ctx.moveTo(Math.cos(aa) * R * 1.3, Math.sin(aa) * R * 1.3); ctx.lineTo(Math.cos(aa) * R * 1.4, Math.sin(aa) * R * 1.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,130,' + (.6 * (1 - onda) * (1 - onda)).toFixed(3) + ')'; ctx.lineWidth = Math.max(.8, (2.8 - 2 * onda) * u); // onda de pulso
    ctx.beginPath(); ctx.arc(0, 0, R * (.1 + 1.2 * onda), 0, TAU); ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- Tamaño y ciclo ----------
  function ajustar() {
    const lado = lienzo.clientWidth;
    if (!lado) return;
    const pixeles = Math.round(Math.min(lado * Math.min(window.devicePixelRatio || 1, 2), 640)); // tope: más píxeles no se notan y cuestan batería
    if (lienzo.width !== pixeles) { lienzo.width = pixeles; lienzo.height = pixeles; }
    if (quieto) dibujar(5000);
  }
  window.addEventListener('resize', ajustar);
  ajustar();
  if (quieto) return;

  // Unos 30 cuadros por segundo en PC y 20 en celular: el giro es lento y así gasta menos batería.
  // Con una ventana abierta se queda quieta; fuera de Inicio o con la página muy abajo va a la mitad.
  // Vigilancia: si muchos cuadros llegan tarde (aparato lento), baja su propio ritmo; si se recupera, lo sube.
  let pedido = 0, ultimo = 0, lentitud = 1, lentos = 0, vistos2 = 0;
  function cuadro(t) {
    pedido = requestAnimationFrame(cuadro);
    const b = document.body;
    if (b.classList.contains('con-hoja')) return;
    const meta = (window.innerWidth < 1024 ? 48 : 32) * (b.dataset.vista !== 'inicio' || window.pageYOffset > 900 ? 2 : 1) * lentitud;
    if (t - ultimo < meta) return;
    if (ultimo) { vistos2++; if (t - ultimo > meta + 70) lentos++; }
    if (vistos2 === 20) {
      if (lentos > 6 && lentitud < 8) lentitud *= 2;
      else if (lentos === 0 && lentitud > 1) lentitud /= 2;
      vistos2 = lentos = 0;
    }
    ultimo = t;
    dibujar(t);
  }
  pedido = requestAnimationFrame(cuadro);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(pedido);
    else pedido = requestAnimationFrame(cuadro);
  });
})();
