/* 一棵 的玩法，从 ~/碰/一棵/一棵.py 搬过来（第一个 第 18 天 03:12）。
   你分到一棵有号的小树，每十年可以砍一棵（也可以不砍），到第 300 年为止。
   旁边同时跑一片"一棵没砍"的（同一片林子、同样的天气、每棵树自己的骰子），结尾并排给你看。 */
(function (G) {
  const L = G.林, START = 200, STEP = 10, END = 300;
  const K = { pine: '绿的', oak: '黄的' };

  function Game(J, me) {
    this.J = J; this.me = me;
    this.F = L.fromJSON(J); this.R = L.fromJSON(J);   // R：一棵没砍的那一份，跟着一起过
    this.cuts = []; this.cutThis = false; this.lastQ = null; this.lastWhen = ''; this.life = []; this.gone = null; this.goneR = null; this.over = false;
    this.life.push({ year: this.F.year, h: Math.round(L.height(this.mine())) });
  }
  Game.prototype.mine = function (F) { F = F || this.F; return F.trees.find(t => t.id === this.me) || null; };
  Game.prototype.tips = function (t) { return L.walk(t.root).filter(m => m.main === null || m.lat === null); };
  Game.prototype.shaders = function (F) {   // 冠伸到它头顶上的：图上描黑边的、写号的，字也只列这些（棵2 那条）
    F = F || this.F; const t = this.mine(F); if (!t) return [];
    const tl = this.tips(t); const x0 = Math.min(...tl.map(m => m.x1)) - 2, x1 = Math.max(...tl.map(m => m.x1)) + 2, h = L.height(t);
    return F.trees.filter(u => u !== t && L.walk(u.root).some(m => m.x1 >= x0 && m.x1 <= x1 && m.y1 > h)).sort((a, b) => L.height(b) - L.height(a));
  };
  Game.prototype.status = function () {
    const F = this.F, t = this.mine(), y = F.year;
    if (!t) return [`第 ${y} 年。你那棵（${this.me} 号）已经没了。`];
    const h = L.height(t), q = this.lightNow(), p = this.lastQ;
    // 第一个 03:26：棵网1 棵网2 都说砍完字还是"几乎晒不到"，没觉出变了。原来写的是去年秋天算的光，砍完不重算。现在照眼前这片林子现算，跟上回看的比
    const lit = (q > 0.8 ? '，晒得到' : (q > 0.4 ? '，晒得不太到' : '，几乎晒不到')) + (p === null ? '' : (q > p + 0.03 ? `（比${this.lastWhen}亮了些）` : (q < p - 0.03 ? `（比${this.lastWhen}暗了些）` : `（跟${this.lastWhen}差不多）`)));
    const over = this.shaders();
    const s = [`第 ${y} 年。你那棵：${t.id} 号，${K[t.kind]}，${y - t.born} 岁，高 ${h.toFixed(0)}${lit}。`];
    if (over.length) s.push('冠伸到它头顶上的（图上描黑边的）：' + over.slice(0, 6).map(u => `${u.id} 号（${K[u.kind]}，高 ${L.height(u).toFixed(0)}，树脚离它 ${Math.abs(u.x - t.x).toFixed(0)}）`).join('；') + (over.length > 6 ? `；还有 ${over.length - 6} 棵` : ''));
    else s.push('没有哪棵的冠伸到它头顶上了。');
    const side = F.trees.filter(u => u !== t && Math.abs(u.x - t.x) < 10).map(u => L.height(u));
    if (side.length) s.push(`左右十格里最高的一棵高 ${Math.max(...side).toFixed(0)}。`);
    return s;
  };
  Game.prototype.lightNow = function () {   // 它眼前晒得到多少：拿现在这片林子的影子现算
    const t = this.mine(); if (!t) return 0;
    const g = L.shadowGrid(this.F.trees); return L.gather(t.root, g) / L.count(t.root);
  };
  Game.prototype.mark = function (when) { this.lastQ = this.mine() ? this.lightNow() : null; this.lastWhen = when; };
  Game.prototype.cut = function (id) {
    const F = this.F;
    if (this.over) return '已经结束了。';
    if (this.cutThis) return '这十年已经砍过一棵了，先“过十年”。';
    if (id === this.me) return '那是你那棵。';
    const t = F.trees.find(u => u.id === id); if (!t) return '没有这一棵。';
    this.mark('砍之前'); F.trees = F.trees.filter(u => u !== t); this.cuts.push({ year: F.year, x: t.x, id });
    this.cutThis = true;
    this.life.push({ year: F.year, what: `砍了 ${id} 号（${K[t.kind]}，高 ${L.height(t).toFixed(0)}，树脚离它 ${Math.abs(t.x - this.mine().x).toFixed(0)}）` });
    return `砍了 ${id} 号。`;
  };
  function evText(e) {
    if (e.k === 'fall') return `风 ${e.wind.toFixed(2)} 吹倒了 ${e.id} 号（${e.age} 岁，高 ${e.h.toFixed(0)}，比旁边高出 ${e.out.toFixed(0)}）`;
    if (e.k === 'free') return `${e.id} 号（${e.age} 岁）熬出来了：前面 ${e.lows} 年在影子里，现在晒得到了`;
    if (e.k === 'die') return `${e.id} 号死了（${e.age} 岁，晒不到）`;
    if (e.k === 'break') return `风 ${e.wind.toFixed(2)} 吹断了 ${e.id} 号一根 ${e.c} 截长的${e.lat ? '侧枝' : '梢'}`;
    return '';
  }
  Game.prototype.stepOne = function (F, mineOnly) {   // 过一年，挑跟它有关的事
    const me = this.me, t0 = this.mine(F), x0 = t0 ? t0.x : null, c0 = t0 ? L.count(t0.root) : 0, h0 = t0 ? L.height(t0) : 0;
    const ev = F.oneYear(), t1 = this.mine(F), out = []; let br = 0, ku = 0, gone = null;
    for (const e of ev) {
      if (e.k === 'break') { if (e.id === me) { br += e.c; out.push({ year: F.year, text: evText(e) }); } continue; }
      if (e.k === 'die' && e.id !== me) continue;   // python 那份'死了'那行里没写 x，别的树死了从来不印（一棵.py 解析 x 落空），只印熬出来、吹倒。照它
      if (e.id === me || (x0 !== null && Math.abs(e.x - x0) < 10)) out.push({ year: F.year, text: evText(e), mine: e.id === me });
    }
    if (t0 && t1) { const c1 = L.count(t1.root); if (c1 < c0 - br) ku = c0 - br - c1; }
    if (t0 && !t1) {
      const e = ev.find(e => e.id === me && (e.k === 'fall' || e.k === 'die'));
      gone = `第 ${F.year} 年  ` + (e ? evText(e) : `${me} 号没了（${F.year - t0.born} 岁，高 ${h0.toFixed(0)}）`);
    }
    return { out, br, ku, gone };
  };
  Game.prototype.pass = function () {
    if (this.over) return null;
    this.mark('十年前'); const t = this.mine(), h0 = Math.round(L.height(t)); let out = [], br = 0, ku = 0;
    for (let i = 0; i < STEP; i++) {
      const r = this.stepOne(this.F);
      out = out.concat(r.out); br += r.br; ku += r.ku;
      if (!this.goneR && this.mine(this.R)) { const r2 = this.stepOne(this.R); if (r2.gone) this.goneR = r2.gone; } else this.R.oneYear();
      if (r.gone) { this.gone = r.gone; if (!out.some(o => o.mine)) out.push({ year: this.F.year, text: r.gone.replace(/^第 \d+ 年  /, ''), mine: true }); break; }
    }
    this.cutThis = false;
    const t1 = this.mine();
    const sum = (t1 && (br || ku)) ? `这十年它高从 ${h0} 到 ${Math.round(L.height(t1))}：` + [br ? `风吹断了 ${br} 截枝` : '', ku ? `晒不到的枝自己枯掉 ${ku} 截` : ''].filter(Boolean).join('，') + '。' : '';
    this.life.push({ year: this.F.year, h: t1 ? Math.round(L.height(t1)) : null });
    if (!t1 || this.F.year >= END) this.over = true;
    return { out, sum };
  };
  Game.prototype.ending = function () {
    while (this.R.year < this.F.year) { if (!this.goneR && this.mine(this.R)) { const r2 = this.stepOne(this.R); if (r2.gone) this.goneR = r2.gone; } else this.R.oneYear(); }
    const lines = this.life.map(l => `第 ${l.year} 年  ` + (l.what ? l.what : (l.h !== null && l.h !== undefined ? `高 ${l.h}` : '没了')));
    const t = this.mine();
    lines.push(this.gone || `第 ${this.F.year} 年  还站着，高 ${L.height(t).toFixed(0)}`);
    const t2 = this.mine(this.R);
    const other = this.goneR || `第 ${this.R.year} 年它还站着，高 ${L.height(t2).toFixed(0)}`;
    return { lines, other };
  };
  G.一棵 = { Game, START, STEP, END, K };
})(typeof window !== 'undefined' ? window : globalThis);
