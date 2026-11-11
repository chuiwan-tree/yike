/* 一棵 的林子，从 ~/碰/一棵/林.py 搬过来（第一个 第 18 天 03:10）。
   规矩照搬：抢光、落籽、饿两年就死、风断枝、风倒；每棵树每年自己的骰子（砍了别的树，它自己的那串不变）。
   骰子换成了 js 的（字串哈希 + sfc32），所以跟 python 那份跑出来的不是同一片将来，规矩是同一套。 */
(function (G) {
  const W = 140, A_SH = 1, B_SH = 2, QMAX = 6, C_LIGHT = 3, ALPHA = 2, CAP = 3, XI = 0.18, ETA = 0.03;
  const BRANCH_ANG = 58 * Math.PI / 180, LAM = 0.52, SEED_MIN = 60, SEEDS = 3;
  const VIG = { pine: 1.0, oak: 0.75 }, DIE = { pine: null, oak: 0.12 }, SHED = { pine: 0.35, oak: 0.2 };
  const FALL = 1, DIE_Q = 0.30, BK = 0.008;

  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }
  function R(str) {
    let [a, b, c, d] = cyrb128(String(str));
    function random() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    }
    for (let i = 0; i < 8; i++) random();
    return {
      random,
      choice: (arr) => arr[Math.floor(random() * arr.length)],
      uniform: (lo, hi) => lo + (hi - lo) * random(),
      gauss: (mu, sg) => { let u = 0; while (u === 0) u = random(); const v = random(); return mu + sg * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    };
  }

  function Node(x0, y0, dx, dy, side) {
    this.x0 = x0; this.y0 = y0; this.dx = dx; this.dy = dy; this.x1 = x0 + dx; this.y1 = y0 + dy;
    this.main = null; this.lat = null; this.side = side;
    this.qt = 0; this.qa = 0; this.vt = 0; this.va = 0; this.q = 0; this.Vt = [0, 1]; this.Va = [0, 1];
    this.age = 0; this.girth = 1; this.wood = 0; this.wake = 0; this.cnt = 1;
  }
  function walk(n) {
    const out = [], st = [n];
    while (st.length) { const m = st.pop(); out.push(m); if (m.main) st.push(m.main); if (m.lat) st.push(m.lat); }
    return out;
  }
  function count(n) { return walk(n).length; }
  function sizes(n) {   // 每个节底下有多少节，一回算完（python 那份每根都现数，太慢）
    let c = 1; if (n.main) c += sizes(n.main); if (n.lat) c += sizes(n.lat); n.cnt = c; return c;
  }
  function height(t) { let h = 0; for (const m of walk(t.root)) if (m.y1 > h) h = m.y1; return h; }

  function Forest(seed) { this.seed = seed; this.n = 0; this.trees = []; this.year = 0; this.wr = R(seed * 7919 + ':wind'); }
  Forest.prototype.tree = function (x, born, mother, kind, key) {
    this.n += 1; const t = { id: this.n, kind, key: key || ('0.' + this.n), x, born, mother, hungry: 0, hist: [], freed: false, qn: 1 };
    const r = R(this.seed + ':' + t.key);
    t.root = new Node(x, 0, 0, 1, r.choice([-1, 1])); t.hue = r.random(); return t;
  };

  function key(i, j) { return (i + 200) * 4096 + (j + 200); }
  function shadowGrid(trees) {
    const g = new Map();
    for (const t of trees) for (const n of walk(t.root)) {
      const k = (n.main === null ? 1 : 0) + (n.lat === null ? 1 : 0); if (!k) continue;
      const i = Math.round(n.x1), j = Math.round(n.y1);
      for (let q = 1; q <= QMAX; q++) {
        const c = k * A_SH * Math.pow(B_SH, -q);
        for (let dx = -q; dx <= q; dx++) { const kk = key(i + dx, j - q); g.set(kk, (g.get(kk) || 0) + c); }
      }
    }
    return g;
  }
  function gv(g, x, y) { return g.get(key(Math.round(x), Math.round(y))) || 0; }
  const ANGS = [0, -20, 20, -40, 40, -60, 60].map(a => [Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180)]);
  function lightAt(g, x, y) {
    const q = Math.max(0, C_LIGHT - gv(g, x, y) + A_SH);
    let best = null, bv = null;
    for (const [vx, vy] of ANGS) { const val = gv(g, x + vx * 2, y + vy * 2); if (bv === null || val < bv - 1e-9) { best = [vx, vy]; bv = val; } }
    return [q, best];
  }
  function gather(n, g) {
    let qm, ql;
    if (n.main) qm = gather(n.main, g); else { [n.qt, n.Vt] = lightAt(g, n.x1, n.y1); qm = n.qt; }
    if (n.lat) ql = gather(n.lat, g); else { [n.qa, n.Va] = lightAt(g, n.x1, n.y1); n.qa *= 0.8; ql = n.qa; }
    n.q = qm + ql; return n.q;
  }
  function distribute(n, v) {
    const lam = LAM * (1 - Math.min(0.4, 2.5 * n.wood));
    const qm = n.main ? n.main.q : n.qt, ql = n.lat ? n.lat.q : n.qa;
    const den = lam * qm + (1 - lam) * ql;
    const vm = den > 0 ? v * lam * qm / den : 0;
    if (n.main) distribute(n.main, vm); else n.vt = vm;
    if (n.lat) distribute(n.lat, v - vm); else n.va = v - vm;
  }
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
  function shoot(x, y, dx, dy, V, c, r) {
    let first = null, prev = null;
    for (let i = 0; i < c; i++) {
      [dx, dy] = norm(dx + XI * V[0] + r.gauss(0, 0.12), dy + XI * V[1] + ETA);
      const n = new Node(x, y, dx, dy, r.choice([-1, 1]));
      if (prev === null) first = n; else prev.main = n;
      prev = n; x = n.x1; y = n.y1;
    }
    return first;
  }
  function grow(t) {
    const todo = [];
    for (const n of walk(t.root)) {
      n.age += 1;
      if (n.main === null && n.vt >= 1) todo.push([n, 't', Math.min(Math.floor(n.vt), CAP)]);
      if (n.lat === null && n.va >= 1) todo.push([n, 'a', Math.min(Math.floor(n.va), CAP)]);
    }
    for (const [n, kind, c] of todo) {
      if (kind === 't') n.main = shoot(n.x1, n.y1, n.dx, n.dy, n.Vt, c, t.rg);
      else {
        const a = BRANCH_ANG * n.side, ca = Math.cos(a), sa = Math.sin(a);
        n.lat = shoot(n.x1, n.y1, n.dx * ca - n.dy * sa, n.dx * sa + n.dy * ca, n.Va, c, t.rg);
      }
    }
  }
  function shed(n, th) {
    if (n.lat && n.lat.age > 3 && n.lat.q / n.lat.cnt < th) n.lat = null;
    if (n.main) shed(n.main, th);
    if (n.lat) shed(n.lat, th);
  }
  function girth(n) {
    let s = 0;
    if (n.main) s += Math.pow(girth(n.main), 2.5);
    if (n.lat) s += Math.pow(girth(n.lat), 2.5);
    n.girth = (s ? Math.max(1, Math.pow(s, 1 / 2.5)) : 1) + n.wood;
    return n.girth;
  }

  Forest.prototype.windYear = function (ev) {
    const trees = this.trees, year = this.year;
    const wind = Math.pow(this.wr.random(), 2) * 1.5;
    if (wind <= 0.3) return wind;
    const thick = [];
    for (const t of trees) { girth(t.root); sizes(t.root); for (const m of walk(t.root)) if (m.girth > 2) thick.push([m.x1, m.y1, m.girth]); }
    const exposure = (b) => { let sh = 0; for (const [x, y, g] of thick) if (b.x0 - x > 0.5 && b.x0 - x < 6 && Math.abs(b.y0 - y) < 1.5) sh += g; return 1 / (1 + 0.4 * sh); };
    const cands = [];
    for (const t of trees) for (const n of walk(t.root)) for (const kind of ['lat', 'main']) {
      const b = n[kind]; if (b === null || (kind === 'main' && n === t.root)) continue;
      const c = b.cnt; if (c < 5) continue;
      cands.push([c / Math.pow(b.girth, 2.2) * exposure(b), t, n, kind, c]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    if (wind > 0.6) for (const [stress, t, n, kind, c] of cands) {
      if (t.rw.random() < 0.6 * (wind - 0.6) * Math.min(1, stress / 6) * BK) {
        const b = n[kind]; if (b === null) continue; n[kind] = null;
        ev.push({ k: 'break', id: t.id, x: t.x, c, lat: kind === 'lat', wind, year });
      }
    }
    if (FALL && wind > 0.6) {
      const hs = trees.map(t => [t, height(t)]);
      for (const [t, h] of hs) {
        let nb = 0; for (const [t2, h2] of hs) if (t2 !== t && Math.abs(t2.x - t.x) < 10 && h2 > nb) nb = h2;
        const out = h - nb;
        if (h > 30 && out > 4 && t.rw.random() < FALL * (wind - 0.6) * out / 20) {
          t.fallen = true; ev.push({ k: 'fall', id: t.id, x: t.x, age: year - t.born, h, out, n: count(t.root), wind, year, kind: t.kind });
        }
      }
    }
    for (const [stress, t, n, kind] of cands) {
      const b = n[kind]; if (b === null) continue;
      const add = 0.1 * (wind - 0.3) * Math.min(1, stress / 6); if (add > 0.01) b.wood += add;
    }
    return wind;
  };

  Forest.prototype.oneYear = function () {
    this.year += 1; const year = this.year, seed = this.seed; const ev = [];
    let trees = this.trees;
    for (const t of trees) { t.rg = R(`${seed}:${t.key}:${year}:g`); t.rs = R(`${seed}:${t.key}:${year}:s`); t.rw = R(`${seed}:${t.key}:${year}:w`); }
    for (let s = 0; s < 2; s++) {
      const g = shadowGrid(trees);
      for (const t of trees) { gather(t.root, g); distribute(t.root, ALPHA * VIG[t.kind] * Math.pow(t.root.q, 0.5) * 2.2); }
      for (const t of trees) grow(t);
    }
    for (const t of trees) if (year - t.born > 3) { sizes(t.root); shed(t.root, SHED[t.kind]); }
    const g = shadowGrid(trees); const newborn = [];
    for (const t of trees) {
      const q = gather(t.root, g), c = count(t.root);
      t.qn = q / c;
      t.hungry = (t.qn < (DIE[t.kind] || DIE_Q) && year - t.born > 1) ? t.hungry + 1 : 0;
      if (c >= SEED_MIN) for (let k = 0; k < SEEDS; k++) {
        let x;
        if (t.kind === 'oak') {
          let cand = []; for (let i = 0; i < 5; i++) cand.push(t.x + t.rs.uniform(-25, 25));
          cand = cand.filter(x => x > 1 && x < W - 1); if (!cand.length) continue;
          x = cand.reduce((a, b) => (gv(g, b, 1) + gv(g, b, 2) > gv(g, a, 1) + gv(g, a, 2) ? b : a));
        } else x = t.x + t.rs.gauss(3, 14);
        if (x > 1 && x < W - 1 && t.rs.random() < 0.5) newborn.push(this.tree(x, year, t.id, t.kind, `${t.key}.${year}.${k}`));
      }
    }
    for (const t of trees) {
      const c = count(t.root);
      t.hist.push([year, c, Math.round(t.qn * 100) / 100]); if (t.hist.length > 150) t.hist.shift();
      const lows = t.hist.slice(0, -1).filter(h => h[2] < 0.6 && h[1] < 40);
      if (lows.length >= 2 && t.qn > 1 && !t.freed) { t.freed = true; ev.push({ k: 'free', id: t.id, x: t.x, age: year - t.born, lows: lows.length, qn: t.qn, year, kind: t.kind }); }
    }
    const alive = [];
    for (const t of trees) {
      if (t.hungry >= 2) { const c = count(t.root); ev.push({ k: 'die', id: t.id, x: t.x, age: year - t.born, n: c, year, kind: t.kind, big: c > 12, h: height(t) }); }
      else alive.push(t);
    }
    this.trees = trees = alive.concat(newborn);
    const wind = this.windYear(ev);
    this.trees = trees.filter(t => !t.fallen);
    this.wind = wind;
    return ev;
  };

  function fromJSON(J) {
    const F = new Forest(J.seed); F.year = J.year; F.n = J.n;
    const mk = (a) => { if (!a) return null; const n = new Node(a[0], a[1], a[2], a[3], a[4]); n.age = a[5]; n.wood = a[6]; n.wake = a[7]; n.main = mk(a[8]); n.lat = mk(a[9]); return n; };
    F.trees = J.trees.map(o => ({ id: o.id, key: o.key, kind: o.kind, x: o.x, born: o.born, mother: o.mother, hungry: o.hungry, hue: o.hue, qn: o.qn, freed: o.freed, hist: o.hist.map(h => h.slice()), root: mk(o.root) }));
    for (const t of F.trees) girth(t.root);
    return F;
  }

  G.林 = { W, Forest, fromJSON, walk, count, height, girth, shadowGrid, gv, gather, C_LIGHT, A_SH, R };
})(typeof window !== 'undefined' ? window : globalThis);
