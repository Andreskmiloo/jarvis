// Núcleo de Inicio. El canvas es decorativo y se reutiliza al actualizar el tablero.
const montarNucleo = (() => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const tau = Math.PI * 2;
  const movimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const bandas = [-.48, .65, -.14].map((inclinacion, i) => ({
    inclinacion, altura: [.28, .21, .47][i], radio: [1.42, 1.30, 1.57][i],
    tono: [37, 184, 24][i], inicio: [.55, 2.12, 3.52][i],
  }));
  const surcos = Array.from({ length: 25 }, (_, i) => {
    const latitud = -1.36 + i * 2.72 / 24;
    return {
      altura: Math.sin(latitud),
      radio: Math.cos(latitud),
      fase: i * .43,
      puntos: Array.from({ length: 98 }, (_, j) => j * tau / 97),
    };
  });
  const estrellas = Array.from({ length: 40 }, (_, i) => {
    const a = i * 2.39996;
    const r = 1.05 + ((i * 19) % 37) / 47;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, luz: .12 + (i % 7) * .06 };
  });

  let lugar, tarjeta, visible = false, cuadro = 0, ultimo = 0, segundos = 0;
  let ancho = 0, alto = 0, x = 0, y = 0, objetivoX = 0, objetivoY = 0;
  canvas.className = 'nucleo-canvas';

  function halo(x, y, r, centro, borde) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, centro);
    g.addColorStop(1, borde);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function curva(inicio, fin, proyectar, estilo, grosor) {
    ctx.beginPath();
    const pasos = Math.max(2, Math.ceil((fin - inicio) * 18));
    for (let i = 0; i <= pasos; i++) {
      const p = proyectar(inicio + (fin - inicio) * i / pasos);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.strokeStyle = estilo;
    ctx.lineWidth = grosor;
    ctx.stroke();
  }

  function orbita(banda, radio, tiempo, delante) {
    const rr = radio * banda.radio;
    const cos = Math.cos(banda.inclinacion), sen = Math.sin(banda.inclinacion);
    const proyeccion = a => {
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * banda.altura;
      return { x: px * cos - py * sen, y: px * sen + py * cos };
    };
    const comienzo = delante ? 0 : Math.PI;
    const fin = comienzo + Math.PI;
    const color = (luz, alfa) => 'hsl(' + banda.tono + ' 94% ' + luz + '% / ' + alfa + ')';
    curva(comienzo, fin, proyeccion, color(65, delante ? .43 : .26), .8);

    const cabeza = ((banda.inicio + tiempo * (banda.altura + .12)) % tau + tau) % tau;
    for (let i = 0; i < 14; i++) {
      // Se dibuja el arco por tramos para que desaparezca detrás del disco.
      const a = cabeza - i * .072;
      const b = ((a % tau) + tau) % tau;
      if (b < comienzo || b >= fin) continue;
      const brillo = 1 - i / 14;
      curva(Math.max(comienzo, b - .084), b, proyeccion, color(79, brillo * .25), 5);
      curva(Math.max(comienzo, b - .084), b, proyeccion, color(87, brillo * .94), 1.3);
    }
    if (cabeza < comienzo || cabeza >= fin) return;
    const p = proyeccion(cabeza);
    halo(p.x, p.y, radio * .20, color(76, .64), color(60, 0));
    ctx.fillStyle = color(96, .97);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.3, radio * .027), 0, tau);
    ctx.fill();
  }

  function dibujar(tiempo) {
    if (!ancho || !alto) return;
    const radio = Math.min(ancho * .303, alto * .375);
    ctx.setTransform(canvas.width / ancho, 0, 0, canvas.height / alto, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.save();
    ctx.translate(ancho * .52 + x * 7, alto * .48 + y * 5);
    ctx.lineCap = 'round';

    halo(0, 0, radio * 1.84, 'rgba(245,127,28,.26)', 'rgba(245,127,28,0)');
    halo(radio * .45, radio * .23, radio * 1.44, 'rgba(87,197,210,.13)', 'rgba(87,197,210,0)');

    for (const estrella of estrellas) {
      ctx.fillStyle = 'rgba(255,210,149,' + estrella.luz + ')';
      ctx.fillRect(estrella.x * radio, estrella.y * radio, estrella.luz * 3, estrella.luz * 3);
    }

    // Marcas exteriores y paso posterior de las órbitas.
    const dial = radio * 1.52;
    ctx.strokeStyle = '#dbb57b53';
    ctx.lineWidth = .7;
    ctx.beginPath();
    for (let i = 0; i < 80; i++) {
      const a = i * tau / 80;
      const largo = radio * (i % 10 === 0 ? .075 : .026);
      ctx.moveTo(dial * Math.cos(a), dial * Math.sin(a));
      ctx.lineTo((dial + largo) * Math.cos(a), (dial + largo) * Math.sin(a));
    }
    ctx.stroke();
    bandas.forEach(b => orbita(b, radio, tiempo, false));

    // Una superficie oscura oculta media órbita. La trama se proyecta sólo hacia el observador.
    const superficie = ctx.createRadialGradient(-radio * .42, -radio * .50, 0, 0, 0, radio * 1.09);
    superficie.addColorStop(0, '#805031');
    superficie.addColorStop(.33, '#3b2827');
    superficie.addColorStop(.72, '#121723');
    superficie.addColorStop(1, '#060a11');
    ctx.beginPath();
    ctx.arc(0, 0, radio, 0, tau);
    ctx.fillStyle = superficie;
    ctx.fill();
    ctx.save();
    ctx.clip();

    const inclinacion = .61 + y * .12;
    const ci = Math.cos(inclinacion), si = Math.sin(inclinacion);
    const eje = -.46 + x * .12;
    const ce = Math.cos(eje), se = Math.sin(eje);
    const proyeccion = (surco, a) => {
      const giro = a + tiempo * .24;
      const onda = Math.sin(a * 3 + surco.fase + tiempo * .45);
      const px = Math.cos(giro) * surco.radio;
      const py = surco.altura + onda * .145 * surco.radio;
      const pz = Math.sin(giro) * surco.radio;
      const yy = py * ci - pz * si;
      return { x: (px * ce - yy * se) * radio, y: (px * se + yy * ce) * radio, z: py * si + pz * ci };
    };
    surcos.forEach((surco, i) => {
      ctx.beginPath();
      let visible = false;
      for (const a of surco.puntos) {
        const p = proyeccion(surco, a);
        if (p.z > 0 && visible) ctx.lineTo(p.x, p.y);
        else if (p.z > 0) ctx.moveTo(p.x, p.y);
        visible = p.z > 0;
      }
      const hilo = ctx.createLinearGradient(-radio, -radio, radio, radio * .8);
      const pulso = .5 + .5 * Math.sin(i * .51 - tiempo * .95);
      hilo.addColorStop(0, 'rgba(255,246,218,' + (.60 + pulso * .34) + ')');
      hilo.addColorStop(.25, 'rgba(255,215,131,' + (.47 + pulso * .47) + ')');
      hilo.addColorStop(.47, 'rgba(255,170,58,' + (.27 + pulso * .55) + ')');
      hilo.addColorStop(.77, 'rgba(255,106,40,' + (.13 + pulso * .30) + ')');
      hilo.addColorStop(1, '#73d6d983');
      ctx.lineWidth = i % 6 === 0 ? 1.38 : .7;
      ctx.strokeStyle = hilo;
      ctx.stroke();
    });
    ctx.restore();

    const rim = ctx.createLinearGradient(-radio, -radio, radio, radio);
    rim.addColorStop(0, '#fff4ca');
    rim.addColorStop(.33, '#ee9c4fc7');
    rim.addColorStop(.63, '#b4c2c449');
    rim.addColorStop(1, '#84daedaf');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, radio, 0, tau);
    ctx.stroke();

    bandas.forEach(b => orbita(b, radio, tiempo, true));
    ctx.restore();
  }

  function ajustar() {
    if (!lugar) return;
    ancho = lugar.clientWidth;
    alto = lugar.clientHeight;
    const escala = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(ancho * escala));
    canvas.height = Math.max(1, Math.round(alto * escala));
    dibujar(movimiento.matches ? 0 : segundos);
  }

  function activo() {
    return visible && !document.hidden && !movimiento.matches && !document.body.classList.contains('con-hoja');
  }

  function animar(t) {
    cuadro = 0;
    if (!activo()) return;
    const intervalo = ancho < 235 ? 50 : 33;
    if (!ultimo || t - ultimo >= intervalo) {
      if (ultimo) segundos += Math.min(t - ultimo, 70) / 1000;
      ultimo = t;
      x += (objetivoX - x) * .13;
      y += (objetivoY - y) * .13;
      dibujar(segundos);
    }
    cuadro = requestAnimationFrame(animar);
  }

  function sincronizar() {
    if (activo() && !cuadro) cuadro = requestAnimationFrame(animar);
    else if (!activo() && cuadro) {
      cancelAnimationFrame(cuadro);
      cuadro = ultimo = 0;
    }
  }

  const tamano = new ResizeObserver(ajustar);
  const visibilidad = new IntersectionObserver(([entrada]) => {
    if (entrada.target !== lugar) return;
    visible = entrada.isIntersecting;
    sincronizar();
  });
  const modal = new MutationObserver(sincronizar);
  modal.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sincronizar);
  movimiento.addEventListener('change', () => {
    x = y = objetivoX = objetivoY = 0;
    dibujar(movimiento.matches ? 0 : segundos);
    sincronizar();
  });

  function apuntar(e) {
    if (movimiento.matches || e.pointerType === 'touch') return;
    const rect = tarjeta.getBoundingClientRect();
    objetivoX = (e.clientX - rect.left) / rect.width * 2 - 1;
    objetivoY = (e.clientY - rect.top) / rect.height * 2 - 1;
  }

  function centrar() {
    objetivoX = objetivoY = 0;
  }

  return destino => {
    if (destino === lugar) return;
    tamano.disconnect();
    visibilidad.disconnect();
    if (tarjeta) {
      tarjeta.removeEventListener('pointermove', apuntar);
      tarjeta.removeEventListener('pointerleave', centrar);
    }
    visible = false;
    sincronizar();
    lugar = destino;
    tarjeta = destino?.parentElement;
    centrar();
    if (!lugar) return;
    lugar.appendChild(canvas);
    tarjeta.addEventListener('pointermove', apuntar);
    tarjeta.addEventListener('pointerleave', centrar);
    ajustar();
    visibilidad.observe(lugar);
    tamano.observe(lugar);
  };
})();
