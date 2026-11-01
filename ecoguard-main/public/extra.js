// EcoGuard One - login, tabs, climate impact, land finder.
// Loaded after the main script in index.html, so it can use S, cls, api(), md(), esc() from there.
(function () {
'use strict';
const $ = id => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const TK = 'eg_token', base = () => (typeof api === 'function' ? api() : '') || '';
const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mdH = t => (typeof md === 'function' ? md(t) : escH(t));
const netMsg = e => e instanceof TypeError ? "Can't reach the server. It may be waking up - wait about 30 seconds and try again." : e.message;
window.authH = () => { const t = store.get(TK); return t ? { Authorization: 'Bearer ' + t } : {}; };

async function jf(path, opt = {}) {
  const r = await fetch(base() + path, { ...opt, headers: { 'Content-Type': 'application/json', ...authH(), ...(opt.headers || {}) } });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && !/^\/api\/(login|signup)/.test(path)) logout(true);
  if (!r.ok) { const e = new Error(j.error || ('Server returned ' + r.status)); e.status = r.status; throw e; }
  return j;
}

/* ================= login / sign up ================= */
let mode = 'login';
function setMode(m) {
  mode = m;
  $('aName').hidden = m !== 'signup';
  $('aGo').textContent = m === 'signup' ? 'Create account' : 'Sign in';
  $('aPass').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
  $('aSub').textContent = m === 'signup' ? 'Create your account to start monitoring' : 'Sign in to open your dashboard';
  $('aErr').textContent = '';
  document.querySelectorAll('#aSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
}
document.querySelectorAll('#aSeg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
$('pwShow').onclick = () => { const p = $('aPass'), s = p.type === 'password'; p.type = s ? 'text' : 'password'; $('pwShow').textContent = s ? 'Hide' : 'Show'; };
$('aForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('aGo'); btn.disabled = true; $('aErr').textContent = '';
  try {
    const body = { email: $('aEmail').value, password: $('aPass').value };
    if (mode === 'signup') body.name = $('aName').value;
    const j = await jf('/api/' + mode, { method: 'POST', body: JSON.stringify(body) });
    store.set(TK, j.token); $('aPass').value = ''; enter(j.user);
  } catch (err) { $('aErr').textContent = netMsg(err); }
  btn.disabled = false;
};
function enter(user) {
  document.body.classList.add('authed');
  $('userName').textContent = user.name || user.email;
  show(store.get('eg_tab') || 'dash');
}
function logout(expired) {
  store.del(TK);
  document.body.classList.remove('authed');
  if (typeof openChat === 'function') openChat(0);
  $('aPass').value = '';
  $('aErr').textContent = expired === true ? 'Your session ended - please sign in again.' : '';
}
window.egLogout = logout;
$('logout').onclick = () => logout();
if (store.get(TK)) jf('/api/me').then(j => enter(j.user)).catch(e => { if (e.status !== 401) $('aErr').textContent = netMsg(e); });

/* ================= tabs ================= */
const TABS = [['dash', 'Dashboard'], ['climate', 'Impact on climate'], ['land', 'Land finder']];
$('tabs').innerHTML = TABS.map(t => `<button data-t="${t[0]}">${t[1]}</button>`).join('');
$('tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.t); };
let curTab = 'dash';
function show(id) {
  if (!TABS.some(t => t[0] === id)) id = 'dash';
  curTab = id; store.set('eg_tab', id);
  TABS.forEach(t => $('tab-' + t[0]).classList.toggle('on', t[0] === id));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
  if (id === 'climate') climateOpen();
  if (id === 'dash') { S.fresh = 1; if (typeof chart === 'function') chart(); }
}

/* ================= impact on climate ================= */
// Everything here is an ESTIMATE: real fault counts/durations from the hardware, multiplied by the editable assumptions below.
const A0 = { kw: 5, ineffV: 12, ineffT: 8, kwW: 1.5, ineffW: 25, grid: 0.71, lagH: 6 };
let saved = {}; try { saved = JSON.parse(store.get('eg_asm') || '{}'); } catch (e) {}
const C = { src: null, hours: 24, annual: false, a: { ...A0, ...saved }, data: null, err: '', loading: false };

// session counter: runs while the dashboard is open (works in simulation too)
const SS = { obs: 0, last: Date.now(), s: { vib: { ep: 0, min: 0, lvl: 0 }, temp: { ep: 0, min: 0, lvl: 0 }, turb: { ep: 0, min: 0, lvl: 0 } } };
function acc() {
  const n = Date.now(), dt = Math.min((n - SS.last) / 60000, 5 / 60); SS.last = n; SS.obs += dt;
  for (const k of ['vib', 'temp', 'turb']) {
    const c = cls(k, S.last[k]), lvl = c === 'Critical' ? 2 : c === 'Warning' ? 1 : 0, o = SS.s[k];
    if (o.lvl > 0) o.min += dt;
    if (lvl > 0 && o.lvl === 0) o.ep++;
    o.lvl = lvl;
  }
}
const _render = window.render;
window.render = function () { try { acc(); } catch (e) {} return _render.apply(this, arguments); };
const sessionSum = () => ({ observed_min: SS.obs, sensors: Object.fromEntries(Object.keys(SS.s).map(k => [k, { episodes: SS.s[k].ep, fault_min: SS.s[k].min }])) });

const NAMES = { vib: 'Vibration', temp: 'Temperature', turb: 'Water clarity' };
function model(sum) {
  const a = C.a, P = { vib: a.kw * a.ineffV / 100, temp: a.kw * a.ineffT / 100, turb: a.kwW * a.ineffW / 100 };   // kW wasted while a fault lasts
  const scale = C.annual && sum.observed_min >= 60 ? 525600 / sum.observed_min : 1;
  const rows = ['vib', 'temp', 'turb'].map(k => {
    const s = sum.sensors[k], withMin = s.fault_min, withoutMin = Math.max(withMin, s.episodes * a.lagH * 60);   // without alerts a fault runs until the next routine check
    return { k, ep: s.episodes * scale, withKWh: withMin / 60 * P[k] * scale, withoutKWh: withoutMin / 60 * P[k] * scale };
  });
  rows.forEach(r => { r.withCO2 = r.withKWh * a.grid; r.withoutCO2 = r.withoutKWh * a.grid; });
  return { rows, scale };
}
const niceMax = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
function fmtKg(kg) { const g = kg * 1000; return kg < 1 ? (g < 10 ? g.toFixed(1) : g.toFixed(0)) + ' g' : (kg < 10 ? kg.toFixed(2) : kg.toFixed(1)) + ' kg'; }
function barSvg(rows, key, color, f, unit, nm, label) {
  const W = 420, H = 260, L = 50, R = 10, T = 22, B = 44, ph = H - T - B, pw = (W - L - R) / rows.length, bw = Math.min(78, pw * .62);
  let s = `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">`;
  for (let i = 0; i <= 4; i++) {
    const v = nm * i / 4, y = T + ph - ph * i / 4;
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--mt)" opacity=".18"/><text x="${L - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="var(--mt)">${+v.toPrecision(3)}</text>`;
  }
  s += `<text x="4" y="12" font-size="11" fill="var(--mt)">${unit === 'g' ? 'g' : 'kg'} CO₂e</text>`;
  rows.forEach((r, i) => {
    const v = r[key], h = Math.max(v * f / nm * ph, v > 0 ? 3 : 0), x = L + pw * i + (pw - bw) / 2, y = T + ph - h;
    s += `<rect class="bar" style="animation-delay:${i * .12}s" x="${x}" y="${y}" width="${bw}" height="${h}" rx="9" fill="${color}"/>`;
    s += `<text x="${x + bw / 2}" y="${y - 7}" font-size="12.5" font-weight="700" text-anchor="middle" fill="var(--tx)">${fmtKg(v)}</text>`;
    s += `<text x="${x + bw / 2}" y="${H - 20}" font-size="12.5" text-anchor="middle" fill="var(--mt)">${NAMES[r.k]}</text>`;
  });
  return s + '</svg>';
}

function buildClimate() {
  const a = C.a, inp = (id, lab, step) => `<div><label for="${id}">${lab}</label><input id="${id}" type="number" min="0" step="${step}" value="${a[id.slice(2)]}"></div>`;
  $('tab-climate').innerHTML = `
  <div class="sect"><h1>Impact on climate</h1><p>How much avoidable CO₂ a machine or water fault causes when it is caught late (routine checks) versus caught instantly by EcoGuard alerts. Fault counts and durations come from your hardware readings.</p></div>
  <div class="ctl"><div class="seg" id="cSrc"><button data-s="hw">Hardware history</button><button data-s="ses">This session</button></div>
    <div class="seg" id="cWin"><button data-h="1">1 h</button><button data-h="24">24 h</button><button data-h="168">7 days</button><button data-h="336">14 days</button></div>
    <label><input type="checkbox" id="cAnn"> Project to 1 year</label><button class="btn ghost" id="cRef" style="padding:6px 14px">↻ Refresh</button></div>
  <div id="climateBody"></div>
  <details class="glass card" id="cAsm" style="margin-top:14px"><summary>Assumptions behind the estimate (you can change them)</summary>
   <div class="asm">${inp('c_kw', 'Machine power (kW)', 'any')}${inp('c_ineffV', 'Energy wasted during vibration fault (%)', 'any')}${inp('c_ineffT', 'Energy wasted during overheating (%)', 'any')}${inp('c_kwW', 'Water pump / treatment power (kW)', 'any')}${inp('c_ineffW', 'Energy wasted during cloudy-water fault (%)', 'any')}${inp('c_grid', 'Grid emissions (kg CO₂ per kWh)', 'any')}${inp('c_lagH', 'Hours a fault goes unnoticed without alerts', 'any')}</div>
   <p class="note">Method: with EcoGuard, fault time is what the sensors actually recorded above the warning limit. Without EcoGuard, each fault episode is assumed to run until the next routine check (the hours above). Energy wasted = fault hours × power × waste %, CO₂ = energy × grid factor (India's grid is roughly 0.7 kg/kWh). These are estimates for comparison, not measured emissions.</p>
   <button class="btn ghost" id="cReset" style="margin-top:6px;padding:6px 14px">Reset to defaults</button></details>`;
  $('cSrc').onclick = e => { const b = e.target.closest('button'); if (!b) return; C.src = b.dataset.s; sync(); climateLoad(); };
  $('cWin').onclick = e => { const b = e.target.closest('button'); if (!b) return; C.hours = +b.dataset.h; sync(); climateLoad(); };
  $('cAnn').onchange = e => { C.annual = e.target.checked; draw(true); };
  $('cRef').onclick = () => climateLoad();
  $('cAsm').addEventListener('input', e => { const k = e.target.id && e.target.id.slice(2), v = parseFloat(e.target.value); if (k in A0 && v >= 0) { C.a[k] = v; store.set('eg_asm', JSON.stringify(C.a)); draw(false); } });
  $('cReset').onclick = () => { C.a = { ...A0 }; store.set('eg_asm', JSON.stringify(C.a)); for (const k in A0) $('c_' + k).value = A0[k]; draw(false); };
}
function sync() {
  document.querySelectorAll('#cSrc button').forEach(b => b.classList.toggle('on', b.dataset.s === C.src));
  document.querySelectorAll('#cWin button').forEach(b => b.classList.toggle('on', +b.dataset.h === C.hours));
  $('cWin').style.display = C.src === 'hw' ? '' : 'none';
}
function climateOpen() { if (!$('climateBody')) buildClimate(); if (!C.src) C.src = S.src === 'cloud' ? 'hw' : 'ses'; sync(); climateLoad(); }
async function climateLoad() {
  if (C.src !== 'hw') { C.err = ''; draw(true); return; }
  C.loading = true; draw(true);
  try {
    const th = {}; for (const k of ['vib', 'temp', 'turb']) th[k] = S.th[k];
    C.data = await jf('/api/impact?hours=' + C.hours + '&th=' + encodeURIComponent(JSON.stringify(th))); C.err = '';
  } catch (e) {
    C.data = null; C.err = netMsg(e);
    if (e.status === 503) { C.src = 'ses'; sync(); C.err = ''; }      // no database -> fall back to this session
  }
  C.loading = false; draw(true);
}
let lastHtml = '';
function setBody(el, html, anim) { if (html === lastHtml) return; lastHtml = html; el.classList.toggle('still', !anim); el.innerHTML = html; }
function draw(anim) {
  const el = $('climateBody'); if (!el) return;
  const hw = C.src === 'hw', sum = hw ? C.data : sessionSum();
  if (!sum) { setBody(el, `<div class="glass card empty">${C.loading ? 'Loading hardware history…' : escH(C.err || 'No data yet.')}</div>`, anim); return; }
  const m = model(sum), R = m.rows, tw = R.reduce((a, r) => a + r.withoutCO2, 0), tc = R.reduce((a, r) => a + r.withCO2, 0), sv = tw - tc, pct = tw > 0 ? sv / tw * 100 : 0;
  const kwhS = R.reduce((a, r) => a + r.withoutKWh - r.withKWh, 0), eps = R.reduce((a, r) => a + r.ep, 0);
  const maxKg = Math.max(...R.flatMap(r => [r.withCO2, r.withoutCO2])), unit = maxKg < 1 ? 'g' : 'kg', f = unit === 'g' ? 1000 : 1, nm = maxKg * f < 0.01 ? 1 : niceMax(maxKg * f * 1.08);   // nm = top of the shared y-axis
  const per = hw ? (C.hours >= 24 ? C.hours / 24 + ' day' + (C.hours > 24 ? 's' : '') : C.hours + ' h') : 'this session', obs = sum.observed_min;
  const obsT = obs < 1 ? Math.round(obs * 60) + ' s' : obs < 60 ? Math.round(obs) + ' min' : (obs / 60).toFixed(1) + ' h';
  const proj = m.scale !== 1 ? ` · projected to 1 year from ${obsT} of data` : (C.annual ? ' · need at least 1 h of data to project a year' : '');
  setBody(el, `
  <p class="note" style="margin:0 0 10px">Period: <b>${per}</b> · hardware data analysed: ${obsT}${proj}</p>
  <div class="tiles">
    <div class="glass tile bad"><small>Without EcoGuard</small><b>${fmtKg(tw)}</b><span>CO₂e from late-detected faults</span></div>
    <div class="glass tile"><small>With EcoGuard</small><b style="color:var(--ok)">${fmtKg(tc)}</b><span>CO₂e with instant alerts</span></div>
    <div class="glass tile good"><small>Avoided</small><b>${fmtKg(sv)}</b><span>${pct.toFixed(0)}% lower · ${kwhS < 10 ? kwhS.toFixed(2) : kwhS.toFixed(0)} kWh saved</span></div>
    <div class="glass tile"><small>Fault events caught</small><b>${eps < 10 && m.scale === 1 ? Math.round(eps) : Math.round(eps).toLocaleString()}</b><span>warning or critical episodes</span></div>
  </div>
  ${eps === 0 ? `<div class="warn">No fault episodes recorded in this period yet, so both graphs are empty. ${hw ? 'Try a longer period.' : 'In Simulation mode, use <b>Try a scenario</b> on the Dashboard (e.g. “Shaking” or “Heating up”), then come back.'}</div>` : ''}
  <div class="cg" style="margin-top:14px">
    <div class="glass card"><h2>Without EcoGuard</h2><p class="sub">Faults are found on routine checks, about ${C.a.lagH} h after they start</p>${barSvg(R, 'withoutCO2', 'var(--c2)', f, unit, nm, 'Estimated emissions without EcoGuard')}</div>
    <div class="glass card"><h2>With EcoGuard</h2><p class="sub">Buzzer and dashboard alert the moment a limit is crossed</p>${barSvg(R, 'withCO2', 'var(--ok)', f, unit, nm, 'Estimated emissions with EcoGuard')}</div>
  </div>
  <p class="note">Both graphs use the same scale. Estimates only: they combine your recorded fault times with the assumptions below, they are not measured emissions.</p>`, anim);
}
setInterval(() => { if (curTab !== 'climate' || !document.body.classList.contains('authed')) return; if (C.src === 'hw') { if (++draw.n % 6 === 0) climateLoad(); } else draw(false); }, 5000); draw.n = 0;

/* ================= land finder ================= */
const LINKS = [
  ['Government industrial land', [['India Industrial Land Bank (IILB)', 'https://iilb.gov.in'], ['Invest India', 'https://www.investindia.gov.in'], ['MIDC (Maharashtra)', 'https://www.midcindia.org'], ['GIDC (Gujarat)', 'https://gidc.gujarat.gov.in'], ['SIPCOT (Tamil Nadu)', 'https://sipcot.tn.gov.in'], ['KIADB (Karnataka)', 'https://kiadb.karnataka.gov.in'], ['TSIIC (Telangana)', 'https://tsiic.telangana.gov.in'], ['APIIC (Andhra Pradesh)', 'https://www.apiic.in'], ['RIICO (Rajasthan)', 'https://riico.co.in'], ['UPSIDA (Uttar Pradesh)', 'https://upsida.up.gov.in'], ['HSIIDC (Haryana)', 'https://hsiidc.org.in'], ['IDCO (Odisha)', 'https://idco.in']]],
  ['Auction listings', [['IBAPI', 'https://ibapi.in'], ['MSTC e-auction', 'https://www.mstcecommerce.com'], ['BankEAuctions', 'https://www.bankeauctions.com']]],
  ['Private property portals', [['99acres', 'https://www.99acres.com'], ['MagicBricks', 'https://www.magicbricks.com'], ['Housing.com', 'https://housing.com'], ['NoBroker', 'https://www.nobroker.in'], ['PropTiger', 'https://www.proptiger.com']]],
  ['Land record verification', [['Mahabhulekh (Maharashtra)', 'https://bhulekh.mahabhumi.gov.in'], ['Bhoomi (Karnataka)', 'https://landrecords.karnataka.gov.in'], ['Dharani (Telangana)', 'https://dharani.telangana.gov.in']], 'For other states, search “[state name] bhulekh”.'],
  ['Satellite imagery for your own site views', [['ISRO Bhuvan', 'https://bhuvan.nrsc.gov.in'], ['Sentinel Hub', 'https://www.sentinel-hub.com'], ['Copernicus Browser', 'https://browser.dataspace.copernicus.eu']]]
];
$('tab-land').innerHTML = `
  <div class="sect"><h1>Land finder</h1><p>Enter the city where you plan to buy land. EcoGuard checks live air quality around it and the AI suggests the less congested, greener directions, so the new site adds as little as possible to local pollution.</p></div>
  <div class="glass card"><form class="lf" id="lForm"><input id="lCity" placeholder="City, e.g. Pune, Nashik, Coimbatore" maxlength="80" autocomplete="off" required><button class="btn" id="lGo">Find greener areas</button></form></div>
  <div id="landOut"></div>
  <div class="lk"><div class="sect" style="margin-bottom:0"><h1 style="font-size:22px">Where to find and verify land</h1><p>External sites run by third parties. Always verify ownership and land use on the official land-record portal before paying anything.</p></div>
  ${LINKS.map(g => `<h3>${g[0]}</h3><div class="lks">${g[1].map(l => `<a href="${l[1]}" target="_blank" rel="noopener noreferrer"><b>${escH(l[0])}</b><span>${l[1].replace(/^https?:\/\//, '')}</span></a>`).join('')}</div>${g[2] ? `<p class="note" style="margin:8px 2px 0">${g[2]}</p>` : ''}`).join('')}</div>`;

const aqc = v => `<span class="aqc ${v == null ? '' : v <= 50 ? 'g' : v <= 100 ? 'y' : 'r'}">${v == null ? '–' : v}</span>`;
$('lForm').onsubmit = async e => {
  e.preventDefault();
  const city = $('lCity').value.trim(), out = $('landOut'), btn = $('lGo'); if (!city) return;
  btn.disabled = true; out.innerHTML = '<div class="glass card lr"><span class="dots"><i></i><i></i><i></i></span> Checking air quality around ' + escH(city) + '…</div>';
  try {
    const d = await jf('/api/land', { method: 'POST', body: JSON.stringify({ city }) }), P = d.points, best = d.cleanest[0], name = [d.city.name, d.city.admin1].filter(Boolean).join(', ');
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], pt = (dir, km) => P.find(p => p.dir === dir && p.km === km) || {};
    const isBest = (dir, km) => d.cleanest.length && d.cleanest[0].dir === dir && d.cleanest[0].km === km;
    const rows = dirs.map(dr => `<span>${dr}</span><span class="${isBest(dr, 12) ? 'best' : ''}">${aqc(pt(dr, 12).aqi)}</span><span class="${isBest(dr, 25) ? 'best' : ''}">${aqc(pt(dr, 25).aqi)}</span>`).join('');
    out.innerHTML = `<div class="cg lr">
      <div class="glass card"><h2>Air quality around ${escH(name)}</h2><p class="sub">US AQI right now (lower is cleaner)${best ? ` · cleanest: <b>${best.dir}, ${best.km} km</b> (AQI ${best.aqi})` : ''}</p>
        ${d.aq_error ? `<div class="warn">${escH(d.aq_error)}</div>` : `<div class="aq"><span class="hd">Direction</span><span class="hd">12 km</span><span class="hd">25 km</span><span>Centre</span><span>${aqc(P[0].aqi)}</span><span></span>${rows}</div>
        <p class="note" style="margin-top:10px">Green ring = cleanest spot. Modelled snapshot for the current hour, not a yearly average.</p>`}</div>
      <div class="glass card"><h2>✨ AI suggestion</h2>${d.advice ? `<div class="adv">${mdH(d.advice)}</div>` : `<div class="warn">AI advice unavailable: ${escH(d.ai_error || 'unknown error')}. The air-quality table is still valid.</div>`}
        <p class="note" style="margin-top:10px">Greenery and congestion are from the AI's general knowledge, not live satellite data. Confirm on Bhuvan or Copernicus below before deciding.</p></div></div>`;
  } catch (err) { out.innerHTML = `<div class="glass card lr"><div class="warn" style="margin:0">${escH(netMsg(err))}</div></div>`; }
  btn.disabled = false;
};
})();
