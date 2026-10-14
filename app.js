"use strict";
/* Pusat Referensi Regulasi YEH — antarmuka web (HTML + JavaScript biasa). */
(function () {
  const C = window.YEH_CONFIG, API = window.YehApi;
  const $ = s => document.querySelector(s);
  const TOKEN_KEY = C.STORAGE_KEY + ':token';
  const S = { user: null, regs: [], groups: [], groupName: {}, docs: new Map(), doc: null, ver: '', cmp: '',
    admin: null, search: null, searchGroup: '', nav: 0, rowInfo: new Map() };

  /* ---------- Utilitas ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
    return el;
  }
  const norm = s => String(s == null ? '' : s).normalize('NFKC').toLocaleLowerCase('id').replace(/\s+/g, ' ').trim();
  const pretty = id => String(id || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const groupLabel = id => S.groupName[id] || pretty(id) || 'Tanpa kategori';
  const store = {
    get(k) { try { return sessionStorage.getItem(k) || ''; } catch (_) { return ''; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) {} }
  };
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Memproses…'; btn.disabled = true; }
    else { if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.disabled = false; }
  }
  let toastTimer;
  function toast(msg, type) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast ' + (type || ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, type === 'error' ? 6500 : 3200);
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || 'Disalin.', 'ok'); return; } catch (_) {}
    const ta = h('textarea', { readonly: true, class: 'clip' }); ta.value = text;
    (document.querySelector('#dlg[open]') || document.body).append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    toast(ok ? (okMsg || 'Disalin.') : 'Penyalinan tidak diizinkan oleh peramban. Pilih teks lalu tekan Ctrl+C.', ok ? 'ok' : 'error');
  }
  function show(id) { ['viewBoot', 'viewLogin', 'viewChange', 'viewApp'].forEach(v => { $('#' + v).hidden = v !== id; }); }
  function setToken(t) { API.token = t || ''; if (t) store.set(TOKEN_KEY, t); else store.del(TOKEN_KEY); }

  const fmtBab = v => /^bab\b/i.test(v) ? v : 'BAB ' + v;
  const fmtPasal = v => /^pasal\b/i.test(v) ? v : 'Pasal ' + v;
  const fmtAyat = v => /^\(.*\)$/.test(v) ? v : '(' + v + ')';
  const fmtPoin = v => /[.)]$/.test(v) ? v : v + '.';
  const pathOf = o => [o.bab && fmtBab(o.bab), o.pasal && fmtPasal(o.pasal), o.ayat && 'ayat ' + fmtAyat(o.ayat),
    o.poin && 'huruf/angka ' + fmtPoin(o.poin), o.subpoin && fmtPoin(o.subpoin)].filter(Boolean).join(' · ');

  /* Semua panggilan server lewat sini: sesi berakhir → kembali ke layar masuk. */
  async function req(action, payload, opt) {
    try { return await API.call(action, payload, opt); }
    catch (e) {
      if (e.code === 'AUTH' && action !== 'login') { resetSession(); show('viewLogin'); $('#loginMsg').textContent = e.message; }
      else if (e.code === 'CHANGE_REQUIRED') showChange(true);
      throw e;
    }
  }
  function resetSession() {
    setToken(''); S.user = null; S.regs = []; S.docs.clear(); S.doc = null; S.admin = null; S.search = null;
    closeMenu(); if ($('#dlg').open) $('#dlg').close();
  }

  /* ---------- Dialog ---------- */
  function modal(o) {
    const dlg = $('#dlg');
    return new Promise(resolve => {
      const msg = h('p', { class: 'form-msg', role: 'alert' });
      const okBtn = h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'submit' }, o.ok || 'Simpan');
      const cancelBtn = o.cancel === null ? null : h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, o.cancel || 'Batal');
      const form = h('form', { class: 'dlg-form', novalidate: true },
        h('header', { class: 'dlg-head' }, h('h2', { text: o.title }),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup', onclick: () => close(null) }, '×')),
        h('div', { class: 'dlg-body' }, o.body), msg, h('footer', { class: 'dlg-foot' }, cancelBtn, okBtn));
      let done = false;
      function close(v) { if (done) return; done = true; dlg.removeEventListener('cancel', onCancel); if (dlg.open) dlg.close(); resolve(v); }
      function onCancel(e) { e.preventDefault(); if (!okBtn.disabled) close(null); }
      form.addEventListener('submit', async e => {
        e.preventDefault(); msg.textContent = '';
        if (!o.onOk) { close(true); return; }
        busy(okBtn, true, o.busy || 'Menyimpan…'); if (cancelBtn) cancelBtn.disabled = true;
        try { const r = await o.onOk(form); if (r !== false) close(r === undefined ? true : r); }
        catch (err) { msg.textContent = err.message; }
        finally { busy(okBtn, false); if (cancelBtn) cancelBtn.disabled = false; }
      });
      dlg.className = 'dlg' + (o.wide ? ' wide' : '');
      dlg.replaceChildren(form);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      setTimeout(() => { const f = form.querySelector('.dlg-body input:not([readonly]):not([type=checkbox]),.dlg-body select,.dlg-body textarea'); if (f) f.focus(); }, 40);
    });
  }
  const confirmBox = (title, text, ok, danger) => modal({ title, body: h('p', { text }), ok: ok || 'Lanjutkan', danger });
  function field(label, control, hint) { return h('label', { class: 'field' }, h('span', { text: label }), control, hint ? h('small', { text: hint }) : null); }
  function select(name, options, value) {
    const s = h('select', { name });
    options.forEach(([v, l]) => s.append(h('option', { value: v }, l)));
    if (value != null) s.value = value;
    return s;
  }
  function pwInput(name, autocomplete) {
    const inp = h('input', { name, type: 'password', autocomplete, required: true });
    const btn = h('button', { type: 'button', class: 'pw-toggle' }, 'Lihat');
    btn.addEventListener('click', () => { const on = inp.type === 'password'; inp.type = on ? 'text' : 'password'; btn.textContent = on ? 'Sembunyi' : 'Lihat'; });
    return h('span', { class: 'pw' }, inp, btn);
  }

  /* ---------- Masuk & sandi ---------- */
  $('#loginForm .pw-toggle').addEventListener('click', e => {
    const inp = $('#loginForm [name=password]'), on = inp.type === 'password';
    inp.type = on ? 'text' : 'password'; e.currentTarget.textContent = on ? 'Sembunyi' : 'Lihat';
  });
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget, msg = $('#loginMsg'), btn = f.querySelector('button[type=submit]');
    const userId = f.userId.value.trim(), password = f.password.value;
    msg.textContent = '';
    if (!userId || !password) { msg.textContent = 'Isi User ID dan sandi.'; return; }
    busy(btn, true, 'Memeriksa…');
    try { const d = await API.call('login', { userId, password }); f.reset(); afterAuth(d); }
    catch (err) { msg.textContent = err.message; }
    finally { busy(btn, false); }
  });

  function afterAuth(d) {
    setToken(d.token); S.user = d.user;
    if (d.user.changeRequired || !d.init) { showChange(true); return; }
    enterApp(d.init);
  }

  function passwordForm(forced, onSaved) {
    const rules = [
      ['len', 'Minimal 8 karakter', p => p.length >= 8],
      ['mix', 'Memuat huruf dan angka', p => /[A-Za-z]/.test(p) && /[0-9]/.test(p)],
      ['id', 'Tidak sama dengan User ID', p => !!p && norm(p) !== norm(S.user && S.user.id)],
      ['same', 'Ulangi sandi baru sama persis', (p, c) => !!p && p === c]
    ];
    const ul = h('ul', { class: 'rules' }, rules.map(r => h('li', { 'data-r': r[0] }, r[1])));
    const oldP = pwInput('oldPassword', 'current-password'), newP = pwInput('newPassword', 'new-password'), conf = pwInput('confirm', 'new-password');
    const body = h('div', null,
      field(forced ? 'Sandi sementara (dari admin)' : 'Sandi lama', oldP),
      field('Sandi baru', newP), field('Ulangi sandi baru', conf), ul);
    const check = () => {
      const p = newP.firstChild.value, c = conf.firstChild.value;
      rules.forEach(r => ul.querySelector('[data-r=' + r[0] + ']').classList.toggle('ok', r[2](p, c)));
      return rules.every(r => r[2](p, c));
    };
    body.addEventListener('input', check);
    async function submit() {
      if (!oldP.firstChild.value) throw Error('Isi sandi lama.');
      if (!check()) throw Error('Sandi baru belum memenuhi semua syarat.');
      const d = await req('changePassword', { oldPassword: oldP.firstChild.value, newPassword: newP.firstChild.value });
      setToken(d.token); S.user = d.user;
      onSaved(d);
    }
    return { body, submit };
  }

  function showChange(forced) {
    if (!forced) {
      const pf = passwordForm(false, () => toast('Sandi berhasil diganti.', 'ok'));
      modal({ title: 'Ganti sandi', body: pf.body, ok: 'Simpan sandi', onOk: () => pf.submit() });
      return;
    }
    const card = $('#changeCard');
    const pf = passwordForm(true, d => { toast('Sandi berhasil dibuat. Selamat datang.', 'ok'); enterApp(d.init); });
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Simpan dan lanjutkan');
    const out = h('button', { class: 'btn ghost', type: 'button', onclick: logout }, 'Keluar');
    const form = h('form', { novalidate: true }, pf.body, msg, h('div', { class: 'auth-actions' }, out, btn));
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg.textContent = ''; busy(btn, true, 'Menyimpan…');
      try { await pf.submit(); } catch (err) { msg.textContent = err.message; } finally { busy(btn, false); }
    });
    card.replaceChildren(
      h('img', { class: 'auth-logo', src: 'assets/logo.png', alt: '' }),
      h('h1', { text: 'Buat sandi baru' }),
      h('p', { class: 'muted', text: 'Halo ' + ((S.user && S.user.name) || '') + '. Demi keamanan, ganti sandi sementara sebelum mulai.' }),
      form);
    show('viewChange');
    setTimeout(() => { const i = form.querySelector('input'); if (i) i.focus(); }, 40);
  }

  async function logout() {
    const t = API.token;
    resetSession(); show('viewLogin'); $('#loginMsg').textContent = '';
    if (t) { try { await API.call('logout', { token: t }); } catch (_) {} }
  }

  /* ---------- Aplikasi ---------- */
  function loadInit(init) {
    S.user = init.user; S.regs = init.regulations || []; S.groups = init.groups || [];
    S.groupName = {}; S.groups.forEach(g => { S.groupName[g.id] = g.name; });
    const name = S.user.name || S.user.id;
    $('#userName').textContent = name; $('#menuName').textContent = name;
    $('#avatar').textContent = name.trim().charAt(0).toUpperCase() || '?';
    $('#menuRole').textContent = (S.user.role === 'ADMIN' ? 'Admin' : 'Pengguna') + ' · ' + S.user.id;
    $('#menuAdmin').hidden = S.user.role !== 'ADMIN';
    $('#menuVersion').textContent = 'Versi web ' + C.APP_VERSION + ' · server ' + (init.version || '-');
    const gf = $('#groupFilter'), keep = gf.value;
    const present = [...new Set(S.regs.map(r => r.group))];
    const order = S.groups.map(g => g.id).filter(id => present.includes(id)).concat(present.filter(id => !S.groupName[id]));
    gf.replaceChildren(h('option', { value: '' }, 'Semua kategori'), order.map(id => h('option', { value: id }, groupLabel(id))));
    gf.value = order.includes(keep) ? keep : '';
    renderSide();
  }
  function enterApp(init) { loadInit(init); show('viewApp'); route(); }

  function orderedGroups(list) {
    const ids = [...new Set(list.map(r => r.group))];
    const known = S.groups.map(g => g.id);
    return ids.sort((a, b) => (known.indexOf(a) < 0 ? 999 : known.indexOf(a)) - (known.indexOf(b) < 0 ? 999 : known.indexOf(b)));
  }
  function renderSide() {
    const q = norm($('#filterInput').value), g = $('#groupFilter').value, box = $('#regList');
    const cur = parseHash();
    const items = S.regs.filter(r => (!g || r.group === g) && (!q || norm(r.title + ' ' + groupLabel(r.group)).includes(q)));
    box.replaceChildren();
    if (!items.length) { box.append(h('p', { class: 'empty', text: 'Tidak ada regulasi yang cocok.' })); return; }
    orderedGroups(items).forEach(gid => {
      const list = items.filter(r => r.group === gid);
      box.append(h('div', { class: 'rg-head' }, h('span', { text: groupLabel(gid) }), h('span', { text: list.length })));
      list.forEach(r => box.append(h('a', { class: 'ri' + (cur.name === 'doc' && cur.id === r.id ? ' active' : ''), href: '#/r/' + encodeURIComponent(r.id) },
        h('span', { class: 't', text: r.title }), r.restricted ? h('span', { class: 'chip pink', text: 'Terbatas' }) : null)));
    });
  }
  $('#filterInput').addEventListener('input', renderSide);
  $('#groupFilter').addEventListener('change', renderSide);

  /* Laci (ponsel) & menu ⋯ */
  function openDrawer() { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; }
  function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }
  $('#btnDrawer').addEventListener('click', () => $('#sidebar').classList.contains('open') ? closeDrawer() : openDrawer());
  $('#scrim').addEventListener('click', closeDrawer);
  function closeMenu() { $('#menu').hidden = true; $('#btnMenu').setAttribute('aria-expanded', 'false'); }
  $('#btnMenu').addEventListener('click', e => { e.stopPropagation(); const m = $('#menu'); m.hidden = !m.hidden; $('#btnMenu').setAttribute('aria-expanded', String(!m.hidden)); });
  document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeDrawer(); } });
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    closeMenu();
    const act = b.dataset.act;
    if (act === 'admin') location.hash = '#/admin';
    else if (act === 'password') showChange(false);
    else if (act === 'refresh') refreshAll(true);
    else if (act === 'logout') logout();
  });

  async function refreshAll(announce) {
    try {
      if (S.user && S.user.role === 'ADMIN') await req('adminClearCache');
      S.docs.clear(); S.doc = null; S.search = null; S.admin = null;
      const init = await req('init'); loadInit(init); await route();
      if (announce) toast('Data dimuat ulang dari spreadsheet.', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function refreshInitQuiet() {
    try { S.docs.clear(); S.doc = null; S.search = null; loadInit(await req('init')); } catch (_) {}
  }

  /* ---------- Navigasi (hash) ---------- */
  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'r' && parts[1]) return { name: 'doc', id: decodeURIComponent(parts[1]), row: Number(parts[2]) || 0 };
    if (parts[0] === 'cari') return { name: 'search', q: decodeURIComponent(parts.slice(1).join('/')) };
    if (parts[0] === 'admin') return { name: 'admin', tab: parts[1] || 'users' };
    return { name: 'home' };
  }
  async function route() {
    if (!S.user || $('#viewApp').hidden) return;
    const r = parseHash(), nav = ++S.nav;
    closeDrawer(); renderSide();
    if (r.name !== 'search') $('#searchInput').value = '';
    if (r.name === 'doc') await openDoc(r.id, r.row, nav);
    else if (r.name === 'search') await runSearch(r.q, nav);
    else if (r.name === 'admin') await showAdmin(r.tab, nav);
    else { renderHome(); window.scrollTo(0, 0); }
  }
  window.addEventListener('hashchange', route);
  const content = () => $('#content');
  function loading(text) { content().replaceChildren(h('div', { class: 'state' }, h('span', { class: 'spinner' }), h('div', { text: text || 'Memuat…' }))); }
  function failed(text, retry) {
    content().replaceChildren(h('div', { class: 'state error' }, h('div', { text }),
      retry ? h('button', { class: 'btn', type: 'button', onclick: retry }, 'Coba lagi') : null));
  }

  /* ---------- Beranda ---------- */
  function renderHome() {
    const groups = orderedGroups(S.regs);
    content().replaceChildren(h('section', { class: 'home' },
      h('h1', { text: 'Selamat datang, ' + (S.user.name || S.user.id) }),
      h('p', { text: 'Pilih regulasi dari daftar, atau cari isi pasal lewat kotak pencarian di atas. ' + S.regs.length + ' regulasi tersedia untuk Anda.' }),
      h('div', { class: 'cat-grid' }, groups.map(gid => {
        const n = S.regs.filter(r => r.group === gid).length;
        return h('button', { class: 'cat', type: 'button', onclick: () => { $('#groupFilter').value = gid; $('#filterInput').value = ''; renderSide(); if (window.innerWidth <= 760) openDrawer(); else $('#regList').scrollTop = 0; } },
          h('strong', { text: groupLabel(gid) }), h('span', { text: n + ' regulasi' }));
      }))));
  }

  /* ---------- Pembaca naskah ---------- */
  async function openDoc(id, row, nav) {
    let doc = S.docs.get(id);
    if (!doc) {
      const meta = S.regs.find(r => r.id === id);
      loading('Memuat ' + (meta ? meta.title : 'naskah') + '…');
      try { doc = await req('document', { id }); S.docs.set(id, doc); }
      catch (e) { if (nav === S.nav) failed(e.message, () => openDoc(id, row, ++S.nav)); return; }
      if (nav !== S.nav) return;
    }
    if (S.doc !== doc) { S.doc = doc; S.ver = doc.defaultVersion || 'utuh'; S.cmp = ''; renderDoc(); }
    else if (!content().querySelector('.doc')) renderDoc();
    if (row) requestAnimationFrame(() => scrollToRow(row, true)); else window.scrollTo(0, 0);
  }

  function renderDoc() {
    const d = S.doc, m = d.meta;
    const vers = d.versions || [];
    const verSel = select('ver', vers.map(v => [v.key, v.name + (v.filled ? '' : ' (kosong)')]), S.ver);
    const cmpSel = select('cmp', [['', 'Tanpa pembanding']].concat(vers.filter(v => v.key !== S.ver).map(v => [v.key, v.name + (v.filled ? '' : ' (kosong)')])), S.cmp);
    const jumpSel = h('select', { name: 'jump' });
    verSel.addEventListener('change', () => { S.ver = verSel.value; if (S.cmp === S.ver) S.cmp = ''; keepAnchor(renderDoc); });
    cmpSel.addEventListener('change', () => { S.cmp = cmpSel.value; keepAnchor(renderDoc); });
    jumpSel.addEventListener('change', () => { if (jumpSel.value) scrollToRow(Number(jumpSel.value), true); jumpSel.value = ''; });
    const utuh = vers.find(v => v.key === 'utuh');
    const meta = [m.verification && 'Diverifikasi: ' + m.verification, m.notes && 'Catatan: ' + m.notes,
      S.ver === 'utuh' && utuh && utuh.detail && 'Sumber kolom: ' + utuh.detail,
      S.cmp && 'Kiri: ' + ((vers.find(v => v.key === S.ver) || {}).name || '') + ' | Kanan: ' + ((vers.find(v => v.key === S.cmp) || {}).name || '')].filter(Boolean);
    const article = h('article', { class: 'law' });
    const head = h('div', { class: 'doc-head' },
      h('div', { class: 'doc-chips' }, h('span', { class: 'chip', text: groupLabel(m.group) }), m.restricted ? h('span', { class: 'chip pink', text: 'Terbatas' }) : null),
      h('h1', { text: m.title }),
      h('div', { class: 'doc-tools' },
        h('label', { class: 'tool' }, h('span', { text: 'Versi naskah' }), verSel),
        h('label', { class: 'tool' }, h('span', { text: 'Bandingkan dengan' }), cmpSel),
        h('label', { class: 'tool' }, h('span', { text: 'Lompat ke' }), jumpSel),
        m.pdf ? h('a', { class: 'btn', href: m.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'PDF asli ↗') : null),
      meta.length ? h('p', { class: 'doc-meta', text: meta.join(' · ') }) : null);
    buildLaw(article, jumpSel);
    content().replaceChildren(h('section', { class: 'doc' }, head, article));
    renderSide();
  }

  function buildLaw(article, jumpSel) {
    const d = S.doc, v = S.ver, c = S.cmp, vname = k => ((d.versions || []).find(x => x.key === k) || {}).name || '';
    const cur = { bab: '', pasal: '' };
    let group = null, count = 0;
    jumpSel.append(h('option', { value: '' }, '— Pilih pasal —'));
    S.rowInfo = new Map();
    if (c) article.append(h('div', { class: 'cmp-head' }, h('span', { text: vname(v) }), h('span', { text: vname(c) })));
    const frag = document.createDocumentFragment();
    for (const r of d.rows) {
      const t = r.t || {}, txt = t[v] || '', ctx = c ? (t[c] || '') : '';
      const pieces = [];
      let consumed = false;
      if (r.bab && r.bab !== cur.bab) {
        cur.bab = r.bab; cur.pasal = '';
        const titleRow = !r.pasal && !r.ayat && !r.poin && !r.subpoin;
        const title = titleRow ? (txt || ctx) : '';
        pieces.push(h('div', { class: 'h-bab' }, h('div', { class: 'no', text: fmtBab(r.bab) }), title ? h('div', { class: 'ttl', text: title }) : null));
        if (titleRow) consumed = true;
        group = h('optgroup', { label: fmtBab(r.bab) + (title ? ' — ' + title.slice(0, 60) : '') });
        jumpSel.append(group);
      }
      if (r.pasal && r.pasal !== cur.pasal) {
        cur.pasal = r.pasal;
        pieces.push(h('h3', { class: 'h-pasal', text: fmtPasal(r.pasal) }));
        (group || jumpSel).append(h('option', { value: r.row }, fmtPasal(r.pasal)));
      }
      if (!consumed && (txt || ctx)) {
        const mk = r.subpoin ? fmtPoin(r.subpoin) : r.poin ? fmtPoin(r.poin) : r.ayat ? fmtAyat(r.ayat) : '';
        const lvl = r.subpoin ? 3 : r.poin ? 2 : r.ayat ? 1 : 0;
        const main = txt ? h('div', { class: 'tx', text: txt }) : h('div', { class: 'tx empty-tx', text: 'Tidak ada teks pada versi ini.' });
        const body = c ? h('div', { class: 'cmp' },
          h('div', null, h('span', { class: 'lbl', text: vname(v) }), main),
          h('div', null, h('span', { class: 'lbl', text: vname(c) }), ctx ? h('div', { class: 'tx', text: ctx }) : h('div', { class: 'tx empty-tx', text: 'Tidak ada teks.' }))) : main;
        pieces.push(h('div', { class: 'para lvl-' + lvl, 'data-row': r.row },
          h('span', { class: 'mk', text: mk }), body, h('button', { type: 'button', class: 'copy', 'data-row': r.row }, 'Salin')));
        S.rowInfo.set(r.row, { path: pathOf({ bab: cur.bab, pasal: cur.pasal, ayat: r.ayat, poin: r.poin, subpoin: r.subpoin }), text: txt || ctx });
      }
      if (pieces.length) { frag.append(h('div', { class: 'r', id: 'row-' + r.row }, pieces)); count++; }
    }
    if (!count) frag.append(h('p', { class: 'state', text: 'Naskah pada versi ini masih kosong. Pilih versi lain.' }));
    article.append(frag);
  }

  document.addEventListener('click', e => {
    const cp = e.target.closest('.law .copy');
    if (cp) {
      const info = S.rowInfo.get(Number(cp.dataset.row));
      if (info) copyText([S.doc.meta.title, info.path, '', info.text].join('\n'), 'Ketentuan disalin.');
      return;
    }
    const p = e.target.closest('.law .para');
    if (p && !window.getSelection().toString()) {
      const was = p.classList.contains('sel');
      document.querySelectorAll('.law .para.sel').forEach(x => x.classList.remove('sel'));
      if (!was) p.classList.add('sel');
    }
  });

  function stickyOffset() {
    let off = $('.topbar').offsetHeight + 8;
    const dh = document.querySelector('.doc-head');
    if (dh && getComputedStyle(dh).position === 'sticky') off += dh.offsetHeight;
    return off;
  }
  function scrollToRow(row, flash) {
    let el = document.getElementById('row-' + row);
    if (!el) { const all = [...document.querySelectorAll('.law .r')]; el = all.find(x => Number(x.id.slice(4)) >= row) || null; }
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - stickyOffset(), behavior: 'smooth' });
    if (flash) { const t = el.querySelector('.para') || el; t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
  }
  function keepAnchor(fn) {
    const off = stickyOffset();
    const anchor = [...document.querySelectorAll('.law .r')].find(x => x.getBoundingClientRect().bottom > off);
    const id = anchor ? Number(anchor.id.slice(4)) : 0;
    fn();
    if (id) { const el = document.getElementById('row-' + id); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }
  }

  /* ---------- Pencarian isi ---------- */
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    if (q.length < 2) { toast('Ketik sedikitnya 2 huruf.', 'error'); return; }
    const target = '#/cari/' + encodeURIComponent(q);
    if (location.hash === target) { S.search = null; route(); } else location.hash = target;
  });
  async function runSearch(q, nav) {
    $('#searchInput').value = q;
    const key = q + '|' + S.searchGroup;
    if (!S.search || S.search.key !== key) {
      loading('Mencari "' + q + '"… Pencarian pertama setelah data diperbarui dapat memakan waktu hingga satu menit.');
      try { const res = await req('search', { query: q, group: S.searchGroup }); S.search = { key, q, res }; }
      catch (e) { if (nav === S.nav) failed(e.message, () => { S.search = null; runSearch(q, ++S.nav); }); return; }
      if (nav !== S.nav) return;
    }
    renderResults();
    window.scrollTo(0, 0);
  }
  function highlight(text, words) {
    const esc = words.filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!esc.length) return [text];
    return text.split(new RegExp('(' + esc.join('|') + ')', 'gi')).map((p, i) => i % 2 ? h('mark', { text: p }) : p);
  }
  function renderResults() {
    const { q, res } = S.search, words = norm(q).split(' ');
    const list = res.results || [];
    const byReg = new Map();
    list.forEach(x => { if (!byReg.has(x.id)) byReg.set(x.id, []); byReg.get(x.id).push(x); });
    const gsel = select('grp', [['', 'Semua kategori']].concat(orderedGroups(S.regs).map(g => [g, groupLabel(g)])), S.searchGroup);
    gsel.addEventListener('change', () => { S.searchGroup = gsel.value; runSearch(q, ++S.nav); });
    const sub = list.length ? list.length + ' temuan di ' + byReg.size + ' regulasi' + (res.truncated ? ' (dibatasi; perjelas kata kunci untuk hasil lebih tepat)' : '') : 'Tidak ada pasal yang memuat semua kata tersebut.';
    content().replaceChildren(h('section', { class: 'results' },
      h('div', { class: 'results-head' }, h('h1', { text: 'Hasil pencarian "' + q + '"' }), h('label', { class: 'tool' }, h('span', { text: 'Kategori' }), gsel)),
      h('p', { class: 'results-sub', text: sub }),
      res.skipped && res.skipped.length ? h('p', { class: 'note', text: 'Tidak dapat dibaca: ' + res.skipped.join(', ') + '. Periksa sheet sumbernya.' }) : null,
      [...byReg.entries()].map(([id, items]) => h('div', { class: 'card res-group' },
        h('header', null, h('h2', { text: items[0].title }), h('span', { class: 'chip', text: groupLabel(items[0].group) }), h('span', { class: 'muted', text: items.length + ' temuan' })),
        items.map(x => h('a', { class: 'res', href: '#/r/' + encodeURIComponent(id) + '/' + x.row },
          h('div', { class: 'res-path', text: pathOf(x) || 'Bagian awal' }), h('p', null, highlight(x.excerpt, words))))))));
  }

  /* ---------- Panel Admin ---------- */
  const ROLE = { ADMIN: 'Admin', USER: 'Pengguna' };
  const TABS = [['users', 'Pengguna'], ['groups', 'Kelompok'], ['regs', 'Regulasi'], ['access', 'Izin dokumen']];
  async function showAdmin(tab, nav) {
    if (S.user.role !== 'ADMIN') { location.hash = '#/'; return; }
    if (!S.admin) {
      loading('Memuat data admin…');
      try { S.admin = await req('adminData'); } catch (e) { if (nav === S.nav) failed(e.message, () => showAdmin(tab, ++S.nav)); return; }
      if (nav !== S.nav) return;
    }
    renderAdmin(TABS.some(t => t[0] === tab) ? tab : 'users');
  }
  function renderAdmin(tab) {
    const body = tab === 'groups' ? adminGroups() : tab === 'regs' ? adminRegs() : tab === 'access' ? adminAccess() : adminUsers();
    content().replaceChildren(h('section', { class: 'admin' },
      h('h1', { text: 'Panel Admin' }),
      h('p', { text: 'Semua perubahan langsung tersimpan di spreadsheet konfigurasi.' }),
      h('nav', { class: 'tabs' }, TABS.map(([k, l]) => h('a', { href: '#/admin/' + k, class: k === tab ? 'on' : null }, l))),
      body));
  }
  function rerenderAdmin() { const r = parseHash(); if (r.name === 'admin') renderAdmin(r.tab); }
  function table(cols, rows, empty) {
    if (!rows.length) return h('div', { class: 'card empty', text: empty || 'Belum ada data.' });
    return h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.cls, text: c.label })))),
      h('tbody', null, rows.map(r => h('tr', null, cols.map(c => h('td', { class: c.cls }, c.render(r))))))));
  }
  function filterBar(placeholder, onInput, ...buttons) {
    const inp = h('input', { type: 'search', placeholder });
    inp.addEventListener('input', () => onInput(norm(inp.value)));
    return h('div', { class: 'bar' }, inp, h('span', { class: 'spacer' }), buttons);
  }
  const gname = id => { const g = (S.admin.groups || []).find(x => x.id === id); return g ? g.name : pretty(id); };

  function showTemp(id, temp, what) {
    const code = h('code', { text: temp });
    return modal({ title: 'Sandi sementara', ok: 'Selesai', cancel: null,
      body: h('div', null,
        h('p', { text: 'Sandi akun "' + id + '" ' + what + '. Sampaikan sandi berikut kepada pemilik akun:' }),
        h('div', { class: 'secret' }, code, h('button', { type: 'button', class: 'btn', onclick: () => copyText(temp, 'Sandi sementara disalin.') }, 'Salin')),
        h('p', { class: 'muted', text: 'Sandi ini hanya tampil sekali dan tidak disimpan di sheet. Pemilik akun wajib menggantinya saat masuk pertama.' })) });
  }

  /* Pengguna */
  function adminUsers() {
    const wrap = h('div');
    const draw = q => {
      const rows = S.admin.users.filter(u => !q || norm(u.id + ' ' + u.name + ' ' + u.groups.map(gname).join(' ')).includes(q));
      wrap.replaceChildren(table([
        { label: 'Pengguna', render: u => [h('strong', { text: u.name || u.id }), h('span', { class: 'sub', text: u.id })] },
        { label: 'Peran', render: u => h('span', { class: 'chip' + (u.role === 'ADMIN' ? ' pink' : ''), text: ROLE[u.role] }) },
        { label: 'Kelompok', render: u => u.groups.length ? h('div', { class: 'chips' }, u.groups.map(g => h('span', { class: 'chip off', text: gname(g) }))) : h('span', { class: 'muted', text: '—' }) },
        { label: 'Status', render: u => h('div', { class: 'chips' },
          h('span', { class: 'chip ' + (u.active === 'YA' ? 'ok' : 'off'), text: u.active === 'YA' ? 'Aktif' : 'Nonaktif' }),
          u.mustChange ? h('span', { class: 'chip warn', text: 'Belum ganti sandi' }) : null,
          u.locked ? h('span', { class: 'chip danger', text: 'Terkunci' }) : null) },
        { label: '', cls: 'act', render: u => [
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => editUser(u) }, 'Ubah'),
          h('button', { class: 'btn small', type: 'button', onclick: () => resetUser(u) }, 'Atur ulang sandi')] }
      ], rows, 'Tidak ada pengguna yang cocok.'));
    };
    draw('');
    return h('div', null, filterBar('Cari pengguna…', draw, h('button', { class: 'btn primary', type: 'button', onclick: () => editUser(null) }, '+ Tambah pengguna')), wrap);
  }
  async function editUser(u) {
    const isNew = !u;
    const id = h('input', { name: 'id', value: u ? u.id : '', readonly: !isNew, autocapitalize: 'none', spellcheck: 'false', required: true });
    const name = h('input', { name: 'name', value: u ? u.name : '', required: true });
    const role = select('role', [['USER', 'Pengguna'], ['ADMIN', 'Admin']], u ? u.role : 'USER');
    const active = select('active', [['YA', 'Aktif'], ['TIDAK', 'Nonaktif']], u ? u.active : 'YA');
    const mine = new Set(u ? u.groups : []);
    const checks = h('div', { class: 'checks' }, S.admin.groups.filter(g => g.active === 'YA' || mine.has(g.id)).map(g =>
      h('label', null, h('input', { type: 'checkbox', value: g.id, checked: mine.has(g.id) }), g.name)));
    const body = h('div', null,
      h('div', { class: 'grid2' }, field('User ID', id, isNew ? 'Huruf, angka, titik, garis bawah, atau minus. Tidak bisa diubah nanti.' : null), field('Nama lengkap', name)),
      h('div', { class: 'grid2' }, field('Peran', role), field('Status', active)),
      h('div', { class: 'field' }, h('span', { text: 'Kelompok' }), checks, h('small', { text: 'Dipakai untuk izin dokumen terbatas.' })),
      isNew ? h('p', { class: 'note', text: 'Sandi sementara dibuat otomatis dan ditampilkan setelah disimpan.' }) : null);
    const res = await modal({ title: isNew ? 'Tambah pengguna' : 'Ubah pengguna', body, wide: true,
      onOk: () => {
        if (!id.value.trim()) throw Error('Isi User ID.');
        return req('adminSaveUser', { isNew, user: { id: id.value.trim(), name: name.value.trim(), role: role.value, active: active.value,
          groups: [...checks.querySelectorAll('input:checked')].map(x => x.value) } });
      } });
    if (!res) return;
    S.admin = res.admin; rerenderAdmin();
    if (res.tempPassword) await showTemp(res.id, res.tempPassword, 'baru dibuat');
    else toast('Pengguna disimpan.', 'ok');
  }
  async function resetUser(u) {
    const res = await modal({ title: 'Atur ulang sandi', danger: true, ok: 'Atur ulang', busy: 'Memproses…',
      body: h('p', { text: 'Buat sandi sementara baru untuk ' + (u.name || u.id) + ' (' + u.id + ')? Sandi lama langsung tidak berlaku, sesi yang sedang terbuka ditutup, dan kunci akun dibuka.' }),
      onOk: () => req('adminResetPassword', { id: u.id }) });
    if (!res) return;
    S.admin = res.admin; rerenderAdmin();
    await showTemp(res.id, res.tempPassword, 'telah diatur ulang');
  }

  /* Kelompok */
  function adminGroups() {
    const wrap = h('div');
    const draw = q => {
      const rows = S.admin.groups.filter(g => !q || norm(g.id + ' ' + g.name).includes(q));
      const count = id => S.admin.users.filter(u => u.groups.includes(id)).length;
      const regs = id => S.admin.regulations.filter(r => r.group === id).length;
      wrap.replaceChildren(table([
        { label: 'Kelompok', render: g => [h('strong', { text: g.name }), h('span', { class: 'sub', text: g.id })] },
        { label: 'Anggota', render: g => String(count(g.id)) },
        { label: 'Regulasi', render: g => String(regs(g.id)) },
        { label: 'Status', render: g => h('span', { class: 'chip ' + (g.active === 'YA' ? 'ok' : 'off'), text: g.active === 'YA' ? 'Aktif' : 'Nonaktif' }) },
        { label: '', cls: 'act', render: g => h('button', { class: 'btn small ghost', type: 'button', onclick: () => editGroup(g) }, 'Ubah') }
      ], rows, 'Tidak ada kelompok yang cocok.'));
    };
    draw('');
    return h('div', null,
      h('p', { class: 'note', text: 'Kelompok dipakai sebagai kategori regulasi sekaligus kelompok pegawai untuk izin dokumen terbatas.' }),
      filterBar('Cari kelompok…', draw, h('button', { class: 'btn primary', type: 'button', onclick: () => editGroup(null) }, '+ Tambah kelompok')), wrap);
  }
  async function editGroup(g) {
    const isNew = !g;
    const id = h('input', { name: 'id', value: g ? g.id : '', readonly: !isNew, required: true });
    const name = h('input', { name: 'name', value: g ? g.name : '', required: true });
    const active = select('active', [['YA', 'Aktif'], ['TIDAK', 'Nonaktif']], g ? g.active : 'YA');
    const res = await modal({ title: isNew ? 'Tambah kelompok' : 'Ubah kelompok',
      body: h('div', null, field('ID kelompok', id, isNew ? 'Contoh: PENGURUS, REKTORAT. Tidak bisa diubah nanti.' : null), field('Nama tampilan', name), field('Status', active)),
      onOk: () => req('adminSaveGroup', { isNew, group: { id: id.value.trim().toUpperCase(), name: name.value.trim(), active: active.value } }) });
    if (!res) return;
    S.admin = res.admin; rerenderAdmin(); toast('Kelompok disimpan.', 'ok'); refreshInitQuiet();
  }

  /* Regulasi */
  function adminRegs() {
    const wrap = h('div');
    const draw = q => {
      const rows = S.admin.regulations.filter(r => !q || norm(r.title + ' ' + r.sheet + ' ' + gname(r.group)).includes(q));
      wrap.replaceChildren(table([
        { label: 'Regulasi', render: r => [h('strong', { text: r.title || r.sheet }), h('span', { class: 'sub', text: 'Sheet: ' + r.sheet })] },
        { label: 'Kategori', render: r => gname(r.group) },
        { label: 'Akses', render: r => h('span', { class: 'chip' + (r.access === 'TERBATAS' ? ' pink' : ''), text: r.access === 'TERBATAS' ? 'Terbatas' : 'Internal' }) },
        { label: 'Status', render: r => h('span', { class: 'chip ' + (r.active === 'YA' ? 'ok' : 'off'), text: r.active === 'YA' ? 'Tampil' : 'Disembunyikan' }) },
        { label: 'PDF', render: r => r.pdf ? h('a', { href: r.pdf, target: '_blank', rel: 'noopener noreferrer' }, 'Buka ↗') : h('span', { class: 'muted', text: '—' }) },
        { label: '', cls: 'act', render: r => h('button', { class: 'btn small ghost', type: 'button', onclick: () => editReg(r) }, 'Ubah') }
      ], rows, 'Tidak ada regulasi yang cocok.'));
    };
    draw('');
    return h('div', null, filterBar('Cari regulasi…', draw,
      h('button', { class: 'btn', type: 'button', onclick: clearCache }, 'Bersihkan cache naskah'),
      h('button', { class: 'btn primary', type: 'button', onclick: syncRegs }, 'Sinkronkan sheet baru')), wrap);
  }
  async function editReg(r) {
    const title = h('input', { name: 'title', value: r.title, required: true });
    const group = select('group', S.admin.groups.map(g => [g.id, g.name + (g.active === 'YA' ? '' : ' (nonaktif)')]), r.group);
    const access = select('access', [['INTERNAL', 'Internal — semua pengguna'], ['TERBATAS', 'Terbatas — hanya yang diizinkan']], r.access);
    const active = select('active', [['YA', 'Tampil'], ['TIDAK', 'Disembunyikan']], r.active);
    const pdf = h('input', { name: 'pdf', value: r.pdf, placeholder: 'https://drive.google.com/…' });
    const ver = h('input', { name: 'verification', value: r.verification, placeholder: 'mis. 14/10/2026' });
    const notes = h('textarea', { name: 'notes' }); notes.value = r.notes;
    const full = h('input', { name: 'fullHeader', value: r.fullHeader, placeholder: 'Kosongkan = kolom "Format utuh"' });
    const base = h('input', { name: 'baseHeader', value: r.baseHeader, placeholder: 'Kosongkan = kolom naskah pertama' });
    const res = await modal({ title: 'Ubah regulasi', wide: true,
      body: h('div', null,
        field('Judul tampilan', title),
        h('div', { class: 'grid2' }, field('Kategori', group), field('Status', active)),
        field('Akses', access),
        h('div', { class: 'grid2' }, field('Tautan PDF asli', pdf), field('Tanggal verifikasi', ver)),
        field('Catatan', notes),
        h('details', { class: 'adv' }, h('summary', null, 'Pengaturan kolom sumber (lanjutan)'),
          h('p', { class: 'muted', text: 'Sheet sumber: ' + r.sheet + '. Isi hanya bila judul kolomnya tidak baku.' }),
          field('Judul kolom naskah berlaku', full), field('Judul kolom naskah dasar', base))),
      onOk: () => req('adminSaveRegulation', { reg: { id: r.id, title: title.value, group: group.value, access: access.value, active: active.value,
        pdf: pdf.value, verification: ver.value, notes: notes.value, fullHeader: full.value, baseHeader: base.value } }) });
    if (!res) return;
    S.admin = res.admin; rerenderAdmin(); toast('Regulasi disimpan.', 'ok'); refreshInitQuiet();
  }
  async function syncRegs() {
    const res = await modal({ title: 'Sinkronkan sheet baru', ok: 'Sinkronkan', busy: 'Memeriksa…',
      body: h('p', { text: 'Sheet baru di spreadsheet sumber akan ditambahkan ke daftar regulasi. Pengaturan regulasi yang sudah ada tidak diubah.' }),
      onOk: () => req('adminSync', {}, { timeout: 180000 }) });
    if (!res) return;
    S.admin = res.admin; rerenderAdmin(); refreshInitQuiet();
    toast(res.added.length ? res.added.length + ' regulasi baru ditambahkan: ' + res.added.map(x => x.name).join(', ') : 'Tidak ada sheet baru.', 'ok');
  }
  async function clearCache() {
    try { await req('adminClearCache'); S.docs.clear(); S.doc = null; S.search = null; toast('Cache naskah dibersihkan.', 'ok'); }
    catch (e) { toast(e.message, 'error'); }
  }

  /* Izin dokumen */
  function adminAccess() {
    const wrap = h('div');
    const regTitle = id => { const r = S.admin.regulations.find(x => x.id === id); return r ? (r.title || r.sheet) : id; };
    const subj = a => a.subjectType === 'GRUP' ? 'Kelompok: ' + gname(a.subjectId) : 'Pengguna: ' + ((S.admin.users.find(u => u.id === a.subjectId) || {}).name || a.subjectId);
    const draw = q => {
      const rows = S.admin.access.filter(a => !q || norm(regTitle(a.regulationId) + ' ' + subj(a)).includes(q));
      wrap.replaceChildren(table([
        { label: 'Regulasi', render: a => h('strong', { text: regTitle(a.regulationId) }) },
        { label: 'Berlaku untuk', render: a => subj(a) },
        { label: 'Efek', render: a => h('span', { class: 'chip ' + (a.effect === 'TOLAK' ? 'danger' : 'ok'), text: a.effect === 'TOLAK' ? 'Tolak' : 'Izinkan' }) },
        { label: 'Status', render: a => h('span', { class: 'chip ' + (a.active === 'YA' ? 'ok' : 'off'), text: a.active === 'YA' ? 'Aktif' : 'Nonaktif' }) },
        { label: '', cls: 'act', render: a => h('button', { class: 'btn small ghost', type: 'button', onclick: () => editAccess(a) }, 'Ubah') }
      ], rows, 'Belum ada izin khusus. Regulasi Internal dapat dibaca semua pengguna; regulasi Terbatas hanya oleh admin.'));
    };
    draw('');
    return h('div', null,
      h('p', { class: 'note', text: 'Internal: dibaca semua pengguna kecuali yang ditolak. Terbatas: hanya yang diizinkan. Bila ada izin dan penolakan sekaligus, penolakan yang berlaku. Admin selalu dapat membaca.' }),
      filterBar('Cari izin…', draw, h('button', { class: 'btn primary', type: 'button', onclick: () => editAccess(null) }, '+ Tambah izin')), wrap);
  }
  async function editAccess(a) {
    const isNew = !a;
    const reg = select('regulationId', S.admin.regulations.map(r => [r.id, (r.title || r.sheet) + (r.access === 'TERBATAS' ? ' (Terbatas)' : '')]), a ? a.regulationId : null);
    const type = select('subjectType', [['GRUP', 'Kelompok'], ['USER', 'Pengguna']], a ? a.subjectType : 'GRUP');
    const subject = h('select', { name: 'subjectId' });
    const fill = () => {
      const opts = type.value === 'GRUP' ? S.admin.groups.map(g => [g.id, g.name]) : S.admin.users.map(u => [u.id, (u.name || u.id) + ' (' + u.id + ')']);
      subject.replaceChildren(...opts.map(([v, l]) => h('option', { value: v }, l)));
      if (a && a.subjectType === type.value) subject.value = a.subjectId;
    };
    type.addEventListener('change', fill); fill();
    if (!isNew) { reg.disabled = true; type.disabled = true; subject.disabled = true; }
    const effect = select('effect', [['IZIN', 'Izinkan membaca'], ['TOLAK', 'Tolak']], a ? a.effect : 'IZIN');
    const active = select('active', [['YA', 'Aktif'], ['TIDAK', 'Nonaktif']], a ? a.active : 'YA');
    const res = await modal({ title: isNew ? 'Tambah izin dokumen' : 'Ubah izin dokumen',
      body: h('div', null, field('Regulasi', reg), h('div', { class: 'grid2' }, field('Berlaku untuk', type), field('Nama kelompok / pengguna', subject)),
        h('div', { class: 'grid2' }, field('Efek', effect), field('Status', active))),
      onOk: () => {
        if (!subject.value) throw Error('Pilih kelompok atau pengguna.');
        return req('adminSaveAccess', { rule: { regulationId: reg.value, subjectType: type.value, subjectId: subject.value, effect: effect.value, active: active.value } });
      } });
    if (!res) return;
    S.admin = res.admin; rerenderAdmin(); toast('Izin dokumen disimpan.', 'ok'); refreshInitQuiet();
  }

  /* ---------- Mulai ---------- */
  async function boot() {
    const tok = store.get(TOKEN_KEY);
    if (!tok) { show('viewLogin'); return; }
    API.token = tok;
    try {
      const init = await API.call('init');
      S.user = init.user;
      if (init.user.changeRequired) { showChange(true); return; }
      enterApp(init);
    } catch (e) {
      if (e.code === 'AUTH') setToken('');
      show('viewLogin');
      $('#loginMsg').textContent = e.code === 'AUTH' ? '' : e.message;
    }
  }
  boot();
})();
