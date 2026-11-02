(function () {
  'use strict';
  var KEY = 'delic_cart_v1';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (v) { return (v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', ',')) + ' KM'; };

  function getCart() { try { var c = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function setCart(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* privatni mod */ } badge(); }
  function badge() {
    var n = getCart().reduce(function (a, x) { return a + x.qty; }, 0), el = document.getElementById('cartN');
    if (!el) return; el.textContent = n; el.hidden = !n;
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  badge();

  // felne: filteri se primjenjuju čim nešto izabereš
  document.querySelectorAll('form[data-auto]').forEach(function (f) {
    f.addEventListener('change', function () { f.querySelectorAll('input[name],select[name]').forEach(function (el) { if (!el.value) el.disabled = true; }); f.submit(); });
  });

  // Viber ne podržava gotov tekst u linku: poruka se kopira, pa je samo zalijepiš u razgovor
  function copyText(t) {
    try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t); return true; } } catch (e) { /* dalje */ }
    try {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }


  // dodaj u korpu
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) {
      var id = Number(add.getAttribute('data-add')), max = Number(add.getAttribute('data-max')) || 1;
      var qEl = document.getElementById('qty'), qty = Math.max(1, Math.min(max, Number(qEl && qEl.value) || 1));
      var c = getCart(), ex = c.filter(function (x) { return x.id === id; })[0];
      if (ex) ex.qty = Math.min(max, ex.qty + qty); else c.push({ id: id, qty: qty });
      setCart(c); toast('Dodano u korpu'); return;
    }
    var th = e.target.closest('[data-thumb]');
    if (th) {
      var main = document.getElementById('mainimg'); if (main) main.src = th.getAttribute('data-thumb');
      document.querySelectorAll('[data-thumb]').forEach(function (b) { b.classList.toggle('on', b === th); });
    }
  });

  // forma za pretragu (sva polja): marka -> model -> vozilo bez ponovnog učitavanja stranice
  document.querySelectorAll('form.sf').forEach(function (form) {
    var m = form.querySelector('[name=marka]'), md = form.querySelector('[name=model]'), v = form.querySelector('[name=vozilo]');
    function fill(sel, items, ph, off) {
      sel.innerHTML = '<option value="">' + esc(ph) + '</option>' + items.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
      sel.disabled = off;
    }
    // model (kucanjem) i marka ne smiju biti u sukobu: izbor modela postavlja marku, a druga marka briše model
    var vmIn = form.querySelector('[name=vm]');
    if (vmIn && m) {
      vmIn.addEventListener('ac-pick', function (e) {
        var label = String(e.detail || '');
        Array.prototype.forEach.call(m.options, function (o) { if (o.value && label.indexOf(o.value + ' ') === 0) m.value = o.value; });
      });
      m.addEventListener('change', function () { if (m.value && vmIn.value && vmIn.value.indexOf(m.value + ' ') !== 0) vmIn.value = ''; });
    }
    if (m && !md) m.addEventListener('change', function () { form.querySelectorAll('input[type=hidden][name=model],input[type=hidden][name=vozilo]').forEach(function (h) { h.remove(); }); });
    if (m && md && v) {
      m.addEventListener('change', function () {
        fill(md, [], 'Prvo odaberi marku', true); fill(v, [], 'Prvo odaberi model', true);
        if (!m.value) return;
        fill(md, [], 'Učitavam…', true);
        fetch('/api/facets?marka=' + encodeURIComponent(m.value)).then(function (r) { return r.json(); })
          .then(function (d) { fill(md, d.models, 'Sve', false); fill(v, [], 'Prvo odaberi model', true); }).catch(function () { fill(md, [], 'Greška, pokušaj ponovo', true); });
      });
      md.addEventListener('change', function () {
        fill(v, [], 'Prvo odaberi model', true);
        if (!md.value) return;
        fetch('/api/facets?marka=' + encodeURIComponent(m.value) + '&model=' + encodeURIComponent(md.value)).then(function (r) { return r.json(); })
          .then(function (d) { fill(v, d.vehicles, 'Sve', false); }).catch(function () { /* mreža */ });
      });
    }
    // pretraga uživo: rezultati se pojavljuju dok kucaš (bez klika na „Traži“)
    var live = document.getElementById('live'), rez = document.getElementById('rez');
    if (live || rez) {
      var timer = null, ctrl = null, seq = 0;
      var run = function () {
        var qs = new URLSearchParams(), ready = false;
        form.querySelectorAll('input[name],select[name]').forEach(function (el) {
          if (!el.value || el.disabled) return;
          qs.set(el.name, el.value);
          if (el.tagName === 'SELECT' || el.value.trim().length >= 2) ready = true;
        });
        var mine = ++seq;
        if (!ready) { if (live) live.innerHTML = ''; return; }
        if (ctrl) ctrl.abort(); ctrl = window.AbortController ? new AbortController() : null;
        var url = '/dijelovi?' + qs.toString();
        fetch(url + '&frag=1', ctrl ? { signal: ctrl.signal } : undefined).then(function (r) { return r.text(); }).then(function (html) {
          if (mine !== seq) return;
          if (live) live.innerHTML = html;
          else { var cur = document.getElementById('rez'); if (cur) cur.outerHTML = html; try { history.replaceState(null, '', url); } catch (e) { /* */ } }
        }).catch(function () { /* prekinuto ili nema veze */ });
      };
      var later = function () { clearTimeout(timer); timer = setTimeout(run, 250); };
      form.addEventListener('input', later);
      form.addEventListener('change', later);
      // početna: "Poništi sve" samo prazni pretragu i sklanja rezultate, bez odlaska na drugu stranicu
      var rs = form.querySelector('.reset');
      if (live && rs) rs.addEventListener('click', function (e) {
        e.preventDefault();
        form.querySelectorAll('input:not([type=hidden]):not([type=submit]),select').forEach(function (el) { if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; });
        form.querySelectorAll('input[type=hidden]').forEach(function (h) { h.remove(); });
        form.querySelectorAll('.ac').forEach(function (u) { u.hidden = true; });
        seq++; clearTimeout(timer); live.innerHTML = '';
        try { history.replaceState(null, '', location.pathname); } catch (er) { /* */ }
      });
    }
    // prazna polja se ne šalju, da adresa ostane kratka
    form.addEventListener('submit', function () {
      form.querySelectorAll('input[name],select[name]').forEach(function (el) { if (!el.value) el.disabled = true; });
    });
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted && document.querySelector('form.sf')) location.reload(); });

  // telefon: blokovi pretrage 3 i 4 sklopljeni dok nemaju vrijednosti; dodir na naslov otvara/zatvara
  if (window.matchMedia && !window.matchMedia('(min-width:900px)').matches) {
    document.querySelectorAll('form.sf .fs').forEach(function (fs, i) {
      var used = Array.prototype.some.call(fs.querySelectorAll('input,select'), function (el) { return el.value; });
      if (i >= 2 && !used) fs.classList.add('shut');
      fs.querySelector('legend').addEventListener('click', function () { fs.classList.toggle('shut'); });
    });
  }

  // lista: na telefonu su filteri i grupe sklopljeni da rezultati budu odmah vidljivi
  if (window.matchMedia && !window.matchMedia('(min-width:900px)').matches) {
    document.querySelectorAll('details.mfold, details.panel').forEach(function (d) { d.open = false; });
  }

  // telefon: nakon pretrage/filtera odmah skoči na rezultate
  if (document.getElementById('rez') && location.search.length > 1 && window.matchMedia && !window.matchMedia('(min-width:900px)').matches) {
    window.addEventListener('load', function () { var r = document.getElementById('rez'); if (r) r.scrollIntoView(); });
  }

  // AJAX forme (upit)
  document.querySelectorAll('form[data-ajax]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = f.querySelector('.form-msg'), btn = f.querySelector('button[type=submit]');
      var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
      btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Šaljem…';
      fetch(f.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok) { msg.className = 'form-msg ok'; msg.textContent = 'Hvala! Upit je poslan, javit ćemo se uskoro.'; f.reset(); }
          else { msg.className = 'form-msg err'; msg.textContent = r.j.error || 'Slanje nije uspjelo.'; btn.disabled = false; }
        })
        .catch(function () { msg.className = 'form-msg err'; msg.textContent = 'Nema veze, pokušaj ponovo.'; btn.disabled = false; });
    });
  });

  // otkup vozila: slike se smanje u pregledniku (max 1600px, JPEG) pa šalju zajedno s formom
  var of = document.getElementById('otkup-form');
  if (of) {
    var files = [], prev = document.getElementById('otkup-prev'), inp = document.getElementById('otkup-files');
    function shrink(file) {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var sc = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    }
    function drawPrev() {
      prev.innerHTML = files.map(function (d, i) { return '<span class="pv"><img src="' + d + '" alt=""><button type="button" data-rm="' + i + '" aria-label="Ukloni">×</button></span>'; }).join('');
    }
    prev.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) { files.splice(Number(b.getAttribute('data-rm')), 1); drawPrev(); } });
    inp.addEventListener('change', function () {
      var list = Array.prototype.slice.call(inp.files).slice(0, 8 - files.length);
      Promise.all(list.map(shrink)).then(function (r) { r.forEach(function (d) { if (d && files.length < 8) files.push(d); }); drawPrev(); inp.value = ''; });
    });
    of.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = of.querySelector('.form-msg'), btn = of.querySelector('button[type=submit]');
      var data = {}; new FormData(of).forEach(function (v, k) { if (k !== 'images') data[k] = v; });
      data.images = files;
      btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Šaljem…';
      fetch('/api/otkup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok) { of.innerHTML = '<h2>Hvala!</h2><p>Ponuda je poslana.</p>'; window.scrollTo(0, 0); }
          else { msg.className = 'form-msg err'; msg.textContent = r.j.error || 'Slanje nije uspjelo.'; btn.disabled = false; }
        })
        .catch(function () { msg.className = 'form-msg err'; msg.textContent = 'Nema veze ili su slike prevelike, pokušaj s manje slika.'; btn.disabled = false; });
    });
  }

  // stranica korpe
  var root = document.getElementById('cart-root');
  if (root) renderCart();

  function renderCart() {
    var cart = getCart();
    if (!cart.length) { root.innerHTML = '<div class="empty"><p>Korpa je prazna.</p><p><a class="btn" href="/dijelovi">Pogledaj dijelove</a></p></div>'; return; }
    fetch('/api/dijelovi?ids=' + cart.map(function (x) { return x.id; }).join(','))
      .then(function (r) { return r.json(); })
      .then(function (items) {
        var by = {}; items.forEach(function (i) { by[i.id] = i; });
        var keep = cart.filter(function (x) { return by[x.id]; });
        var removed = cart.length - keep.length;
        if (removed) { cart = keep; setCart(cart); }
        keep.forEach(function (x) { x.qty = Math.min(x.qty, by[x.id].qty); });
        if (!keep.length) { root.innerHTML = '<div class="empty"><p>Dijelovi iz korpe više nisu dostupni.</p><p><a class="btn" href="/dijelovi">Pogledaj dijelove</a></p></div>'; return; }
        draw(keep, by, removed);
      })
      .catch(function () { root.innerHTML = '<p class="form-msg err">Korpa se nije mogla učitati. Osvježi stranicu.</p>'; });
  }

  function draw(cart, by, removed) {
    var total = 0, unpriced = 0;
    var rows = cart.map(function (x) {
      var p = by[x.id];
      if (p.price) total += p.price * x.qty; else unpriced++;
      return '<div class="cart-row" data-id="' + p.id + '">' +
        (p.img ? '<img src="' + esc(p.img) + '" alt="">' : '<div class="noimg">—</div>') +
        '<div><a href="' + esc(p.url) + '"><b>' + esc(p.title) + '</b></a><br><span class="sub">' + esc(p.internal || '') + '</span><br>' +
        (p.price ? 'Količina <input class="qty-in" type="number" min="1" max="' + p.qty + '" value="' + x.qty + '"> ' : '') +
        '<button class="rm" type="button">Ukloni</button></div>' +
        '<div class="price">' + (p.price ? esc(money(p.price * x.qty)) : '<span class="ask">Upit</span>') + '</div></div>';
    }).join('');
    root.innerHTML = (removed ? '<p class="form-msg err">Neki dijelovi su u međuvremenu prodani i uklonjeni iz korpe.</p>' : '') + rows +
      '<div class="cart-total"><span>Ukupno (bez dostave)</span><span>' + esc(money(total)) + '</span></div>' +
      '<form id="checkout" class="box checkout"><h2>Podaci za narudžbu</h2>' +
      '<input class="hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="f"><span>Ime i prezime</span><input name="name" required maxlength="80" autocomplete="name"></label>' +
      '<label class="f"><span>Telefon</span><input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>' +
      '<label class="f"><span>Email (nije obavezno)</span><input name="email" type="email" maxlength="120" autocomplete="email"></label>' +
      '<div class="radio"><label><input type="radio" name="delivery" value="dostava" checked> Dostava (plaćanje pouzećem)</label>' +
      '<label><input type="radio" name="delivery" value="preuzimanje"> Preuzimanje u našem otpadu</label></div>' +
      '<div id="addr"><label class="f"><span>Grad</span><input name="city" maxlength="80" autocomplete="address-level2"></label>' +
      '<label class="f"><span>Adresa</span><input name="address" maxlength="160" autocomplete="street-address"></label></div>' +
      '<label class="f"><span>Napomena (nije obavezno)</span><textarea name="note" rows="2" maxlength="500"></textarea></label>' +
      '<p class="muted small">Cijena dostave dogovara se telefonom nakon narudžbe. ' + (unpriced ? 'Dijelovi bez cijene ne mogu se naručiti — za njih pošalji upit.' : '') + '</p>' +
      '<button type="submit" class="btn"' + (total ? '' : ' disabled') + '>Pošalji narudžbu</button><p class="form-msg" role="status"></p></form>';

    root.querySelectorAll('.cart-row').forEach(function (row) {
      var id = Number(row.getAttribute('data-id'));
      row.querySelector('.rm').addEventListener('click', function () { setCart(getCart().filter(function (x) { return x.id !== id; })); renderCart(); });
      var q = row.querySelector('.qty-in');
      if (q) q.addEventListener('change', function () {
        var c = getCart(); c.forEach(function (x) { if (x.id === id) x.qty = Math.max(1, Math.min(Number(q.max), Number(q.value) || 1)); }); setCart(c); renderCart();
      });
    });
    var form = document.getElementById('checkout');
    form.querySelectorAll('[name=delivery]').forEach(function (r) {
      r.addEventListener('change', function () { document.getElementById('addr').style.display = form.delivery.value === 'dostava' ? '' : 'none'; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-msg'), btn = form.querySelector('button[type=submit]');
      var d = {}; new FormData(form).forEach(function (v, k) { d[k] = v; });
      d.items = getCart().filter(function (x) { return by[x.id] && by[x.id].price; });
      btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Šaljem narudžbu…';
      fetch('/api/narudzba', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok) {
            setCart([]);
            root.innerHTML = '<div class="box"><h2>Hvala na narudžbi!</h2><p>Broj narudžbe: <b>' + esc(r.j.ref) + '</b></p>' +
              '<p>Dijelovi su rezervisani za tebe. Javit ćemo se telefonom radi potvrde i dogovora o dostavi.</p><p><a class="btn" href="/dijelovi">Nastavi pregled</a></p></div>';
            window.scrollTo(0, 0);
          } else {
            msg.className = 'form-msg err'; msg.textContent = r.j.error || 'Narudžba nije uspjela.'; btn.disabled = false;
            if (r.j.unavailable && r.j.unavailable.length) {
              setCart(getCart().filter(function (x) { return r.j.unavailable.indexOf(x.id) < 0; }));
              setTimeout(renderCart, 2500);
            }
          }
        })
        .catch(function () { msg.className = 'form-msg err'; msg.textContent = 'Nema veze, pokušaj ponovo.'; btn.disabled = false; });
    });
  }
})();

// PWA: service worker + dugme za instalaciju
(function () {
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  var dp = null, standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  function show(txt, fn) {
    if (document.getElementById('pwa-btn')) return;
    var b = document.createElement('button'); b.id = 'pwa-btn'; b.type = 'button'; b.textContent = txt;
    b.onclick = function () { fn(); }; document.body.appendChild(b);
    var x = document.createElement('span'); x.id = 'pwa-x'; x.textContent = '×'; x.onclick = function () { b.remove(); x.remove(); try { localStorage.setItem('pwaNo', '1'); } catch (e) {} };
    document.body.appendChild(x);
  }
  try { if (localStorage.getItem('pwaNo')) return; } catch (e) {}
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); dp = e;
    show('📲 Instaliraj aplikaciju', function () { dp.prompt(); dp.userChoice.then(function () { var b = document.getElementById('pwa-btn'), x = document.getElementById('pwa-x'); if (b) b.remove(); if (x) x.remove(); }); });
  });
  if (/iphone|ipad/i.test(navigator.userAgent)) show('📲 Instaliraj aplikaciju', function () { alert('Pritisnite dugme Podijeli, zatim "Dodaj na početni ekran".'); });
})();

// Padajuća lista prijedloga koja se sužava dok kucaš (umjesto sistemske datalist trake)
(function () {
  var fold = function (s) { return String(s).toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  document.querySelectorAll('input[list], input[data-ac]').forEach(function (inp) {
    var remote = inp.getAttribute('data-ac'), opts = [];
    if (!remote) {
      var dl = document.getElementById(inp.getAttribute('list'));
      if (!dl) return;
      opts = Array.prototype.map.call(dl.options, function (o) { return o.value; });
      inp.removeAttribute('list'); dl.remove();
    }
    var wrap = inp.closest('label') || inp.parentNode; wrap.classList.add('ac-wrap');
    var ul = document.createElement('ul'); ul.className = 'ac'; ul.hidden = true; wrap.appendChild(ul);
    var ctl = null, tmr = null;
    function render() {
      var q = fold(inp.value.trim());
      if (remote) {
        clearTimeout(tmr);
        if (!q) { ul.hidden = true; return; }
        tmr = setTimeout(function () {
          if (ctl) ctl.abort();
          ctl = window.AbortController ? new AbortController() : null;
          var mk = inp.form && inp.form.querySelector('select[name=marka]');
          fetch(remote + '?q=' + encodeURIComponent(inp.value.trim()) + (mk && mk.value ? '&marka=' + encodeURIComponent(mk.value) : ''), ctl ? { signal: ctl.signal } : {})
            .then(function (r) { return r.json(); }).then(function (a) { if (document.activeElement === inp) show(a); }).catch(function () {});
        }, 120);
        return;
      }
      var hit = opts.filter(function (o) { return !q || fold(o).indexOf(q) !== -1; });
      hit.sort(function (a, b) { return (fold(a).indexOf(q) === 0 ? 0 : 1) - (fold(b).indexOf(q) === 0 ? 0 : 1); });
      show(hit);
    }
    function show(hit) {
      if (!hit.length || (hit.length === 1 && hit[0] === inp.value)) { ul.hidden = true; return; }
      ul.innerHTML = '';
      hit.slice(0, 60).forEach(function (o) {
        var li = document.createElement('li'); li.textContent = o;
        li.addEventListener('mousedown', function (e) { e.preventDefault(); });
        li.addEventListener('click', function () {
          inp.value = o; ul.hidden = true;
          inp.dispatchEvent(new CustomEvent('ac-pick', { bubbles: true, detail: o }));
          inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
        ul.appendChild(li);
      });
      ul.hidden = false;
      // telefon: lista ide IZNAD polja (tastatura zaklanja prostor ispod), najbolji prijedlog je uz samo polje
      var up = !window.matchMedia('(min-width:900px)').matches;
      ul.classList.toggle('up', up);
      if (up) {
        var hd = document.querySelector('header.top'), hb = hd ? Math.max(0, hd.getBoundingClientRect().bottom) : 0;
        var room = inp.getBoundingClientRect().top - hb - 24;
        if (room < 170) { window.scrollBy(0, -(170 - room)); room = inp.getBoundingClientRect().top - hb - 24; }
        ul.style.maxHeight = Math.max(120, Math.min(340, room)) + 'px';
      } else ul.style.maxHeight = '';
    }
    inp.addEventListener('input', render);
    inp.addEventListener('focus', render);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { if (document.activeElement === inp && !ul.hidden) render(); });
    inp.addEventListener('blur', function () { setTimeout(function () { ul.hidden = true; }, 150); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') ul.hidden = true; });
  });
})();

// statistika: klik na Viber/WhatsApp na stranici artikla (anonimno)
(function () {
  if (!/^\/(dio|felna)\//.test(location.pathname)) return;
  document.querySelectorAll('.cbtns a.vb, .cbtns a.wa').forEach(function (a) {
    a.addEventListener('click', function () {
      try {
        var h1 = document.querySelector('h1');
        navigator.sendBeacon('/api/klik', new Blob([JSON.stringify({ k: a.classList.contains('vb') ? 'viber' : 'whatsapp', p: location.pathname, t: h1 ? h1.textContent.trim() : '' })], { type: 'application/json' }));
      } catch (e) {}
    });
  });
})();
