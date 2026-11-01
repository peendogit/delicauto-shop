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
