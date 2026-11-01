// Holograma: una esfera de fragmentos dorados que gira detrás de todas las pantallas.
// Es solo adorno: no lee ni guarda datos. Se pausa con la pestaña oculta y, si el sistema
// pide menos movimiento, se dibuja una sola vez (quieta).
(function () {
  const lienzo = document.getElementById('holo');
  if (!lienzo || !lienzo.getContext) return;
  const ctx = lienzo.getContext('2d');
  const quieto = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TAU = Math.PI * 2;

  // ---------- La esfera (se arma una sola vez) ----------
  // Azar repetible: así la esfera se ve igual en cada carga.
  let semilla = 1101;
  const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
  const entre = (a, b) => a + (b - a) * azar();
  const unitario = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vectorAzar = () => unitario([azar() - .5, azar() - .5, azar() - .5]);

  // Muchos anillos de distinto radio e inclinación (más apretados hacia afuera), hechos de
  // trozos cortos y polvo luminoso. Unos pocos son órbitas largas y finas.
  const anillos = [];
  for (let i = 0; i < 36; i++) {
    const orbita = i % 7 === 3;
    const n = vectorAzar();                 // perpendicular al plano del anillo
    const u = unitario(cruz(n, vectorAzar()));
    const v = cruz(n, u);
    const trozos = [];
    for (let a = 0; a < TAU;) {
      const largo = orbita ? entre(.5, 1.3) : entre(.03, .26);
      if (azar() < .82) trozos.push({ a, largo, grueso: !orbita && azar() < .07 });
      a += largo + (orbita ? entre(.1, .5) : entre(.02, .2));
    }
    const polvo = [];
    for (let k = 0; k < 26; k++) polvo.push({ a: azar() * TAU, dr: (azar() - .5) * .08, dz: (azar() - .5) * .08 });
    anillos.push({ r: 1 - .66 * Math.pow(i / 36, 1.5), n, u, v, trozos, polvo, fase: azar() * TAU, w: entre(.05, .25) * (i % 2 ? 1 : -1) });
  }

  // Espiral del núcleo (3 brazos)
  const espiral = [0, 1, 2].map(brazo => {
    const puntos = [];
    for (let k = 0; k < 70; k++) puntos.push({ a: brazo * TAU / 3 + k * .14, r: .03 + Math.pow(k / 70, 1.3) * .3, z: (azar() - .5) * .04 });
    return puntos;
  });

  // Chispas que parpadean
  const chispas = [];
  for (let k = 0; k < 44; k++) {
    const d = vectorAzar(), r = entre(.4, 1.05);
    chispas.push({ x: d[0] * r, y: d[1] * r, z: d[2] * r, f: entre(.8, 2.2), fase: azar() * TAU, tam: entre(.4, 1) });
  }

  // Punto de luz suave (se dibuja escalado para las chispas)
  const brillo = document.createElement('canvas');
  brillo.width = brillo.height = 64;
  (function () {
    const c = brillo.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,244,205,1)'); g.addColorStop(.25, 'rgba(255,196,80,.55)'); g.addColorStop(1, 'rgba(255,140,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  })();

  // ---------- Movimiento ----------
  // La esfera se inclina un poco hacia el puntero y gira con el desplazamiento de la página.
  let px = 0, py = 0, suaveX = 0, suaveY = 0;
  window.addEventListener('pointermove', e => { px = e.clientX / window.innerWidth - .5; py = e.clientY / window.innerHeight - .5; }, { passive: true });

  function dibujar(ms) {
    const L = lienzo.width;
    if (!L) return;
    const R = L * .39;      // radio de la esfera (el resto del lienzo es para el brillo)
    const u = L / 640;      // unidad de grosor: todo escala con el tamaño
    const s = ms / 1000;
    suaveX += (px - suaveX) * .05; suaveY += (py - suaveY) * .05;
    const giroY = s * .14 + suaveX * 1.2 + (window.pageYOffset || 0) * .0014;
    const giroX = .42 + suaveY * .6;
    const cosY = Math.cos(giroY), senY = Math.sin(giroY), cosX = Math.cos(giroX), senX = Math.sin(giroX);

    // Gira un punto 3D, le da perspectiva y deja el resultado en X, Y (pantalla) y Z (profundidad -1..1)
    let X = 0, Y = 0, Z = 0;
    const girar = (x, y, z) => {
      const x1 = x * cosY + z * senY, z1 = z * cosY - x * senY;
      const y1 = y * cosX - z1 * senX, z2 = y * senX + z1 * cosX;
      const k = 3 / (3 - z2 * .9);
      X = x1 * k * R; Y = y1 * k * R; Z = z2;
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, L, L);
    ctx.translate(L / 2, L / 2);
    ctx.globalCompositeOperation = 'lighter'; // la luz se suma: donde se cruzan los trazos, brilla más

    // Aura alrededor de la esfera y brillo del núcleo (degradados: casi no cuestan)
    const aura = ctx.createRadialGradient(0, 0, R * .55, 0, 0, R * 1.3);
    aura.addColorStop(0, 'rgba(255,140,20,0)'); aura.addColorStop(.55, 'rgba(255,150,30,.1)'); aura.addColorStop(1, 'rgba(255,120,10,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, TAU); ctx.fill();
    const nucleo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * .62);
    nucleo.addColorStop(0, 'rgba(255,236,170,.7)'); nucleo.addColorStop(.14, 'rgba(255,184,64,.36)'); nucleo.addColorStop(1, 'rgba(255,130,20,0)');
    ctx.fillStyle = nucleo;
    ctx.beginPath(); ctx.arc(0, 0, R * .62, 0, TAU); ctx.fill();

    // Anillos: los trozos se reparten en tres capas de profundidad (fondo, medio, frente)
    const capas = [[], [], []], baldosas = [], polvo = [[], [], []];
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
          (t.grueso ? baldosas : capas[z > .3 ? 2 : z > -.3 ? 1 : 0]).push(x0, y0, X, Y);
          x0 = X; y0 = Y; z0 = Z;
        }
      }
      for (const d of an.polvo) { sobreAnillo(giro + d.a, d.dr, d.dz); polvo[Z > .3 ? 2 : Z > -.3 ? 1 : 0].push(X, Y); }
    }
    const trazar = (lista, color, ancho) => {
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(.7, ancho);
      ctx.beginPath();
      for (let i = 0; i < lista.length; i += 4) { ctx.moveTo(lista[i], lista[i + 1]); ctx.lineTo(lista[i + 2], lista[i + 3]); }
      ctx.stroke();
    };
    trazar(capas[0], 'rgba(255,120,16,.42)', .9 * u);
    trazar(capas[1], 'rgba(255,170,40,.7)', 1.15 * u);
    trazar(capas[2], 'rgba(255,222,135,.98)', 1.4 * u);
    trazar(baldosas, 'rgba(255,214,120,.92)', 2.1 * u);

    [['rgba(255,140,30,.5)', 1.2], ['rgba(255,184,64,.8)', 1.5], ['rgba(255,232,160,1)', 1.8]].forEach(([color, tam], i) => {
      ctx.fillStyle = color;
      const lado = Math.max(1, tam * u);
      for (let k = 0; k < polvo[i].length; k += 2) ctx.fillRect(polvo[i][k] - lado / 2, polvo[i][k + 1] - lado / 2, lado, lado);
    });

    // Espiral del núcleo: gira más rápido que todo lo demás
    const giroEsp = s * .9, inclina = .6, cosI = Math.cos(inclina), senI = Math.sin(inclina);
    ctx.strokeStyle = 'rgba(255,226,150,.75)'; ctx.lineWidth = Math.max(.8, 1.1 * u);
    for (const brazo of espiral) {
      ctx.beginPath();
      brazo.forEach((e, k) => {
        const x = e.r * Math.cos(e.a + giroEsp), y = e.r * Math.sin(e.a + giroEsp);
        girar(x, y * cosI - e.z * senI, y * senI + e.z * cosI);
        if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.stroke();
    }

    // Chispas
    for (const c of chispas) {
      girar(c.x, c.y, c.z);
      const parpadeo = .55 + .45 * Math.sin(s * c.f * 2 + c.fase);
      const tam = (8 + 18 * c.tam) * u * parpadeo * (.6 + (Z + 1) * .3);
      ctx.globalAlpha = Math.min(1, .35 + parpadeo * .65);
      ctx.drawImage(brillo, X - tam / 2, Y - tam / 2, tam, tam);
    }
    ctx.globalAlpha = 1;

    // Aro de medición alrededor: punteado que avanza, marcas y un arco brillante
    ctx.strokeStyle = 'rgba(255,176,46,.24)'; ctx.lineWidth = Math.max(.7, u);
    ctx.setLineDash([2 * u, 7 * u]); ctx.lineDashOffset = -s * 6 * u;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(.7, .9 * u); ctx.strokeStyle = 'rgba(255,190,90,.3)';
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = i * TAU / 72 + s * .04, largo = i % 6 === 0 ? .06 : .025;
      ctx.moveTo(Math.cos(a) * R * 1.15, Math.sin(a) * R * 1.15);
      ctx.lineTo(Math.cos(a) * R * (1.15 + largo), Math.sin(a) * R * (1.15 + largo));
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,120,.75)'; ctx.lineWidth = Math.max(1, 2 * u);
    ctx.beginPath(); ctx.arc(0, 0, R * 1.1, s * .5, s * .5 + .8); ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- Tamaño y ciclo ----------
  function ajustar() {
    const lado = lienzo.clientWidth;
    if (!lado) return;
    const pixeles = Math.round(Math.min(lado * Math.min(window.devicePixelRatio || 1, 2), 600)); // tope: más píxeles no se notan y cuestan batería
    if (lienzo.width !== pixeles) { lienzo.width = pixeles; lienzo.height = pixeles; }
    if (quieto) dibujar(5000);
  }
  window.addEventListener('resize', ajustar);
  ajustar();
  if (quieto) return;

  // Unos 30 cuadros por segundo en PC y 20 en celular: el giro es lento y así gasta menos batería.
  // Con una ventana abierta se queda quieta; fuera de Inicio o con la página muy abajo va a la mitad.
  // Vigilancia: si muchos cuadros llegan tarde (aparato lento), baja su propio ritmo; si se recupera, lo sube.
  let pedido = 0, ultimo = 0, lentitud = 1, lentos = 0, vistos = 0;
  function cuadro(t) {
    pedido = requestAnimationFrame(cuadro);
    const b = document.body;
    if (b.classList.contains('con-hoja')) return;
    const meta = (window.innerWidth < 1024 ? 48 : 32) * (b.dataset.vista !== 'inicio' || window.pageYOffset > 900 ? 2 : 1) * lentitud;
    if (t - ultimo < meta) return;
    if (ultimo) { vistos++; if (t - ultimo > meta + 70) lentos++; }
    if (vistos === 20) {
      if (lentos > 6 && lentitud < 8) lentitud *= 2;
      else if (lentos === 0 && lentitud > 1) lentitud /= 2;
      vistos = lentos = 0;
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
