(function () {
  "use strict";
  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
  const store = DEMO ? window.Stores.LocalStore() : window.Stores.SupabaseStore(CFG);
  const APP = CFG.APP_NAME || "우리 여행지도";
  const LIMIT = (CFG.STORAGE_LIMIT_MB || 1024) * 1024 * 1024;
  const root = document.getElementById("app");

  const S = { data: { maps: [], entries: [], photos: [], covers: [] }, geo: {}, tab: "maps", openMapId: null, urls: {} };

  // ───────── helpers ─────────
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDate = d => { if (!d) return "날짜 없음"; const [y, m, dd] = d.split("-"); return `${y}. ${+m}. ${+dd}.`; };
  const fmtMB = b => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + "MB";
  const KIND_LABEL = { kr: "국내", seoul: "서울", world: "세계" };
  const KIND_TITLE = { kr: "국내 여행지도", seoul: "서울 여행지도", world: "세계 여행지도" };

  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke-linecap="round"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-9 8"/></svg>',
  };

  function toast(msg, ms = 2400) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  function confirmBox(msg, okLabel = "삭제", danger = true) {
    return new Promise(res => {
      const w = document.createElement("div"); w.className = "confirm";
      w.innerHTML = `<div class="box" role="dialog" aria-modal="true"><p>${esc(msg)}</p><div class="row"><button class="btn" data-v="0">취소</button><button class="btn ${danger ? "primary" : "primary"}" data-v="1" style="${danger ? "background:var(--danger);border-color:var(--danger);color:#fff" : ""}">${esc(okLabel)}</button></div></div>`;
      w.addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b || e.target === w) { w.remove(); res(!!(b && b.dataset.v === "1")); } });
      document.body.appendChild(w);
    });
  }
  function sheet(html, { full = false, onClose } = {}) {
    const w = document.createElement("div"); w.className = "sheet-wrap";
    w.innerHTML = `<div class="sheet ${full ? "full" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { w.remove(); onClose && onClose(); };
    w.addEventListener("click", e => { if (e.target === w || e.target.closest("[data-close]")) close(); });
    document.body.appendChild(w);
    return { el: w.firstElementChild, close, wrap: w };
  }

  // ───────── data ─────────
  async function refresh() {
    S.data = await store.getAll();
    const paths = coverPhotos().map(p => p.thumb_path);
    Object.assign(S.urls, await store.urls(paths));
  }
  async function urlsFor(photos, kind = "thumb") {
    const paths = photos.map(p => kind === "full" ? p.full_path : p.thumb_path).filter(k => !S.urls[k]);
    if (paths.length) Object.assign(S.urls, await store.urls(paths));
  }
  const geoOf = map => S.geo[map.kind];
  const regionName = (map, rid) => { const r = geoOf(map).regions.find(r => r.id === rid); return r ? r.name : rid; };
  const regionFull = (map, rid) => { const r = geoOf(map).regions.find(r => r.id === rid); return r ? (r.group && !r.name.startsWith(r.group) ? r.group + " " + r.name : r.name) : rid; };
  function coverFor(mapId, rid) {
    const c = S.data.covers.find(c => c.map_id === mapId && c.region_id === rid);
    if (c) { const p = S.data.photos.find(p => p.id === c.photo_id); if (p) return p; }
    let best = null;
    for (const p of S.data.photos) if (p.map_id === mapId && p.region_id === rid && (!best || p.created_at > best.created_at)) best = p;
    return best;
  }
  function coverPhotos() {
    const out = [];
    for (const m of S.data.maps) for (const rid of visitedRegions(m.id)) { const p = coverFor(m.id, rid); if (p) out.push(p); }
    return out;
  }
  function visitedRegions(mapId) {
    const s = new Set();
    for (const e of S.data.entries) if (e.map_id === mapId) s.add(e.region_id);
    for (const p of S.data.photos) if (p.map_id === mapId) s.add(p.region_id);
    return s;
  }

  // ───────── map svg ─────────
  let svgSeq = 0;
  function mapSVG(map, { interactive = false, highlight = null } = {}) {
    const g = geoOf(map); const pre = "m" + (++svgSeq) + "-";
    const visited = visitedRegions(map.id);
    let defs = "", paths = "";
    for (const r of g.regions) {
      let fill = "", cls = "region";
      if (visited.has(r.id)) {
        const p = coverFor(map.id, r.id); const u = p && S.urls[p.thumb_path];
        if (u) { const pid = pre + r.id; defs += `<pattern id="${pid}" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="${esc(u)}" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></pattern>`; fill = ` fill="url(#${pid})"`; }
        else cls += " visited";
      } else cls += " empty-r";
      if (highlight === r.id) cls += " hot";
      paths += `<path class="${cls}" d="${r.d}"${fill}${interactive ? ` data-r="${r.id}"` : ""}><title>${esc(r.group ? r.group + " " + r.name : r.name)}</title></path>`;
    }
    const borders = g.borders ? `<path class="borders" d="${g.borders}"/>` : "";
    const labels = interactive ? `<g class="labels">${g.regions.map(r => `<text x="${r.c[0]}" y="${r.c[1]}" data-lw="${r.lw}" data-n="${r.name.length}">${esc(r.name)}</text>`).join("")}</g>` : "";
    return `<svg viewBox="0 0 ${g.w} ${g.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(map.title)} 지도"><defs>${defs}</defs><g>${paths}</g>${borders}${labels}</svg>`;
  }

  // ───────── shell ─────────
  function shell() {
    root.innerHTML = `
      <header class="topbar gutter"><span></span><h1 class="brand" id="title">${esc(APP)}</h1><span></span></header>
      <main class="gutter" id="view"></main>
      <nav class="tabbar" aria-label="메뉴">
        <button data-tab="maps">${ICON.map}<span>여행지도</span></button>
        <button data-tab="timeline">${ICON.list}<span>기록</span></button>
        <button data-tab="settings">${ICON.gear}<span>설정</span></button>
      </nav>`;
    root.querySelector(".tabbar").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); } });
    render();
  }
  function render() {
    root.querySelectorAll(".tabbar button").forEach(b => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    const v = $("#view");
    if (S.tab === "maps") renderMaps(v);
    else if (S.tab === "timeline") renderTimeline(v);
    else renderSettings(v);
  }

  // ───────── maps tab ─────────
  function renderMaps(v) {
    const maps = [...S.data.maps].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const banner = DEMO ? `<div class="banner" style="margin-bottom:16px">체험 모드예요. 기록은 이 기기에만 저장되고, 처음 보이는 사진은 예시예요.</div>` : "";
    if (!maps.length) {
      v.innerHTML = banner + `<div class="empty"><b>아직 지도가 없어요</b>국내지도나 세계지도를 만들고<br>다녀온 곳을 사진으로 채워 보세요.</div><button class="btn primary block" data-act="new">${ICON.plus}새 지도 만들기</button>`;
    } else {
      v.innerHTML = banner + `<div class="cards">${maps.map(m => {
        const vis = visitedRegions(m.id).size, total = geoOf(m).regions.length;
        const pc = S.data.photos.filter(p => p.map_id === m.id).length;
        return `<article class="card"><button class="card-map" data-open="${m.id}" aria-label="${esc(m.title)} 열기">${mapSVG(m)}</button>
          <div class="card-foot"><div class="t"><b>${esc(m.title)}</b><span>${total}곳 중 ${vis}곳 방문 · 사진 ${pc}장</span></div>
          <button class="iconbtn" data-edit="${m.id}" aria-label="이름 바꾸기">${ICON.edit}</button>
          <button class="iconbtn" data-del="${m.id}" aria-label="지도 삭제">${ICON.trash}</button></div></article>`;
      }).join("")}</div><div class="fab-row"><button class="btn primary block" data-act="new">${ICON.plus}새 지도 만들기</button></div>`;
    }
    v.onclick = async e => {
      const t = e.target.closest("[data-open],[data-edit],[data-del],[data-act]"); if (!t) return;
      if (t.dataset.open) openMap(t.dataset.open);
      else if (t.dataset.edit) editMap(t.dataset.edit);
      else if (t.dataset.del) {
        const m = S.data.maps.find(x => x.id === t.dataset.del);
        const pc = S.data.photos.filter(p => p.map_id === m.id).length;
        if (await confirmBox(`'${m.title}'을(를) 삭제할까요? 이 지도의 기록과 사진 ${pc}장도 함께 지워지고 되돌릴 수 없어요.`)) {
          await store.deleteMap(m.id); await refresh(); render(); toast("지도를 삭제했어요");
        }
      } else if (t.dataset.act === "new") newMap();
    };
  }

  function newMap() {
    let kind = "kr";
    const tmp = k => ({ id: "_", kind: k, title: "" });
    const s = sheet(`
      <div class="sheet-head gutter"><button class="iconbtn" data-close aria-label="닫기">${ICON.close}</button><h2>새 지도</h2><span></span></div>
      <div class="gutter stack">
        <div class="choice" role="group" aria-label="지도 종류">
          <button data-k="kr" aria-pressed="true">${mapSVG(tmp("kr"))}<span>국내지도</span></button>
          <button data-k="seoul" aria-pressed="false">${mapSVG(tmp("seoul"))}<span>서울지도</span></button>
          <button data-k="world" aria-pressed="false">${mapSVG(tmp("world"))}<span>세계지도</span></button>
        </div>
        <div class="field"><label for="nm-title">지도 이름</label><input id="nm-title" maxlength="40" value="국내 여행지도"></div>
        <button class="btn primary block" id="nm-go">만들기</button>
      </div>`);
    const inp = $("#nm-title", s.el);
    s.el.querySelector(".choice").onclick = e => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      const prevDefault = KIND_TITLE[kind];
      kind = b.dataset.k;
      s.el.querySelectorAll("[data-k]").forEach(x => x.setAttribute("aria-pressed", x === b));
      if (!inp.value.trim() || inp.value === prevDefault) inp.value = KIND_TITLE[kind];
    };
    $("#nm-go", s.el).onclick = async () => {
      const title = inp.value.trim() || KIND_TITLE[kind];
      $("#nm-go", s.el).disabled = true;
      try { await store.createMap(kind, title); await refresh(); s.close(); render(); toast("지도를 만들었어요"); }
      catch (err) { $("#nm-go", s.el).disabled = false; toast("만들지 못했어요: " + err.message, 4000); }
    };
  }
  function editMap(id) {
    const m = S.data.maps.find(x => x.id === id);
    const s = sheet(`
      <div class="sheet-head gutter"><button class="iconbtn" data-close aria-label="닫기">${ICON.close}</button><h2>지도 이름 바꾸기</h2><span></span></div>
      <div class="gutter stack"><div class="field"><label for="em-title">지도 이름</label><input id="em-title" maxlength="40" value="${esc(m.title)}"></div>
      <button class="btn primary block" id="em-go">저장</button></div>`);
    $("#em-go", s.el).onclick = async () => {
      const title = $("#em-title", s.el).value.trim(); if (!title) return;
      await store.updateMap(id, { title }); await refresh(); s.close(); render(); toast("저장했어요");
    };
  }

  // ───────── map view (pan / zoom / tap) ─────────
  function openMap(id, thenRegion) {
    const m = S.data.maps.find(x => x.id === id); if (!m) return;
    S.openMapId = id;
    const g = geoOf(m);
    const wrap = document.createElement("section"); wrap.className = "mapview";
    document.body.appendChild(wrap);
    let vb = { x: 0, y: 0, w: g.w, h: g.h };
    const base = { ...vb };

    function draw(keep) {
      const vis = visitedRegions(m.id).size;
      wrap.innerHTML = `
        <header class="topbar gutter" style="top:0"><button class="iconbtn" data-x="back" aria-label="뒤로">${ICON.back}</button>
          <h1>${esc(m.title)}<small>${g.regions.length}곳 중 ${vis}곳 방문</small></h1>
          <button class="iconbtn" data-x="search" aria-label="지역 찾기">${ICON.search}</button></header>
        <div class="mapstage">${mapSVG(m, { interactive: true })}
          ${vis === 0 ? `<div class="hint">지역을 눌러 기록을 남겨 보세요</div>` : ""}
          <div class="zoomctl"><button data-x="in" aria-label="확대">${ICON.plus}</button><button data-x="out" aria-label="축소">${ICON.minus}</button><button data-x="fit" aria-label="전체 보기">${ICON.fit}</button></div>
        </div>`;
      const svg = $(".mapstage > svg", wrap);
      if (keep) setVB(svg); else requestAnimationFrame(() => updateLabels(svg));
      bindStage(svg);
    }
    function setVB(svg) { svg = svg || $(".mapstage > svg", wrap); svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); updateLabels(svg); }
    function updateLabels(svg) {
      const lg = svg.querySelector(".labels"); if (!lg) return;
      const r = svg.getBoundingClientRect(); if (!r.width) return;
      const k = Math.min(r.width / vb.w, r.height / vb.h); // screen px per map unit
      const fs = 11 / k;
      lg.setAttribute("font-size", fs.toFixed(3)); lg.style.strokeWidth = (3 / k).toFixed(3);
      for (const t of lg.children) {
        const need = (+t.dataset.n) * 11.5 + 6; // label width in px
        const x = +t.getAttribute("x"), y = +t.getAttribute("y");
        const inView = x > vb.x && x < vb.x + vb.w && y > vb.y && y < vb.y + vb.h;
        t.style.display = inView && (+t.dataset.lw) * k >= need ? "" : "none";
      }
    }
    function toSvg(svg, cx, cy) { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
    function zoomAt(svg, cx, cy, f) {
      const minW = base.w / 14, maxW = base.w * 1.15;
      const nw = Math.min(maxW, Math.max(minW, vb.w / f)); f = vb.w / nw;
      const p = toSvg(svg, cx, cy);
      vb = { x: p.x - (p.x - vb.x) / f, y: p.y - (p.y - vb.y) / f, w: vb.w / f, h: vb.h / f };
      setVB(svg);
    }
    function panBy(svg, dx, dy) {
      const r = svg.getBoundingClientRect(); const u = Math.max(vb.w / r.width, vb.h / r.height);
      vb.x -= dx * u; vb.y -= dy * u;
      vb.x = Math.min(base.w - vb.w * 0.2, Math.max(-vb.w * 0.8, vb.x));
      vb.y = Math.min(base.h - vb.h * 0.2, Math.max(-vb.h * 0.8, vb.y));
      setVB(svg);
    }
    function bindStage(svg) {
      const pts = new Map(); let start = null, last = null, moved = 0, pinch = null;
      svg.addEventListener("pointerdown", e => {
        svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: Date.now() }; last = { ...start }; moved = 0; }
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; moved = 99; }
      });
      svg.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size >= 2 && pinch) {
          const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          panBy(svg, mx - pinch.mx, my - pinch.my); zoomAt(svg, mx, my, d / pinch.d); pinch = { d, mx, my };
        } else if (pts.size === 1 && last) {
          const dx = e.clientX - last.x, dy = e.clientY - last.y; moved += Math.abs(dx) + Math.abs(dy);
          if (moved > 6) panBy(svg, dx, dy); last = { x: e.clientX, y: e.clientY };
        }
      });
      const up = e => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 1) { const p = [...pts.values()][0]; last = { ...p }; }
        if (pts.size === 0 && start && moved <= 6 && Date.now() - start.t < 600) {
          const el = document.elementFromPoint(e.clientX, e.clientY); const r = el && el.closest && el.closest("[data-r]");
          if (r) openRegion(m, r.dataset.r, () => draw(true));
        }
      };
      svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", e => { pts.delete(e.pointerId); pinch = null; moved = 99; });
      svg.addEventListener("wheel", e => { e.preventDefault(); zoomAt(svg, e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    }
    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-x]"); if (!b) return;
      const svg = $(".mapstage > svg", wrap); const r = svg.getBoundingClientRect();
      if (b.dataset.x === "back") { wrap.remove(); S.openMapId = null; render(); }
      else if (b.dataset.x === "in") zoomAt(svg, r.left + r.width / 2, r.top + r.height / 2, 1.6);
      else if (b.dataset.x === "out") zoomAt(svg, r.left + r.width / 2, r.top + r.height / 2, 1 / 1.6);
      else if (b.dataset.x === "fit") { vb = { ...base }; setVB(svg); }
      else if (b.dataset.x === "search") searchRegion(m, rid => openRegion(m, rid, () => draw(true)));
    });
    draw(false);
    if (m.kind === "world" && wrap.clientWidth < 700) { vb = { x: 470, y: 30, w: 530, h: 420 }; setVB(); }
    if (thenRegion) openRegion(m, thenRegion, () => draw(true));
  }

  function searchRegion(m, pick) {
    const g = geoOf(m); const vis = visitedRegions(m.id);
    const s = sheet(`
      <div class="sheet-head gutter"><button class="iconbtn" data-close aria-label="닫기">${ICON.close}</button><h2>지역 찾기</h2><span></span></div>
      <div class="gutter stack"><div class="field"><input id="rs-q" placeholder="${m.kind === "kr" ? "예: 강릉, 제주" : m.kind === "seoul" ? "예: 마포, 강남" : "예: 일본, 프랑스"}" autocomplete="off" aria-label="지역 이름"></div><div class="tl" id="rs-list"></div></div>`, { full: true });
    const list = $("#rs-list", s.el), q = $("#rs-q", s.el);
    const draw = () => {
      const k = q.value.trim();
      const rows = g.regions.filter(r => !k || r.name.includes(k) || (r.group || "").includes(k))
        .sort((a, b) => (vis.has(b.id) - vis.has(a.id)) || a.name.localeCompare(b.name, "ko")).slice(0, 80);
      list.innerHTML = rows.map(r => `<button class="tl-item" data-id="${r.id}" style="grid-template-columns:1fr auto"><span class="tx"><b>${esc(r.name)}</b><span>${esc(r.group || KIND_LABEL[m.kind])}</span></span><span style="color:var(--accent);font-size:13px">${vis.has(r.id) ? "방문함" : ""}</span></button>`).join("") || `<div class="empty">찾는 지역이 없어요</div>`;
    };
    q.oninput = draw; draw();
    list.onclick = e => { const b = e.target.closest("[data-id]"); if (b) { s.close(); pick(b.dataset.id); } };
  }

  // ───────── region detail ─────────
  async function openRegion(m, rid, onChange) {
    const s = sheet(`<div id="rg"></div>`, { full: true });
    async function draw() {
      const entries = S.data.entries.filter(e => e.map_id === m.id && e.region_id === rid)
        .sort((a, b) => ((b.visited_on || "") + b.created_at).localeCompare((a.visited_on || "") + a.created_at));
      const photos = S.data.photos.filter(p => p.map_id === m.id && p.region_id === rid);
      const cover = coverFor(m.id, rid);
      await urlsFor(photos);
      if (cover) await urlsFor([cover], "full");
      const coverId = cover && cover.id;
      $("#rg", s.el).innerHTML = `
        <div class="sheet-head gutter"><button class="iconbtn" data-close aria-label="닫기">${ICON.close}</button><h2>${esc(regionName(m, rid))}<small>${esc(regionFull(m, rid) === regionName(m, rid) ? m.title : regionFull(m, rid).slice(0, -regionName(m, rid).length).trim() + " · " + m.title)}</small></h2><span></span></div>
        <div class="gutter stack">
          <div class="hero">${cover ? `<img alt="${esc(regionName(m, rid))} 대표 사진" src="${esc(S.urls[cover.full_path] || S.urls[cover.thumb_path])}">` : `<span>${ICON.photo.replace("<svg", '<svg style="width:40px;height:40px"')}</span>`}</div>
          <button class="btn primary block" data-a="add">${ICON.plus}기록 추가</button>
          ${entries.length ? "" : `<p class="empty" style="padding:12px">아직 기록이 없어요. 날짜와 메모, 사진을 남겨 보세요.</p>`}
          ${entries.map(e => {
            const ps = photos.filter(p => p.entry_id === e.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
            return `<article class="entry"><div class="entry-top"><span class="d">${fmtDate(e.visited_on)}</span>
              <button class="iconbtn" data-a="edit" data-id="${e.id}" aria-label="기록 수정">${ICON.edit}</button>
              <button class="iconbtn" data-a="del" data-id="${e.id}" aria-label="기록 삭제">${ICON.trash}</button></div>
              ${e.memo ? `<div class="memo">${esc(e.memo)}</div>` : ""}
              ${ps.length ? `<div class="grid">${ps.map(p => `<button data-a="view" data-id="${p.id}" aria-label="사진 크게 보기"><img loading="lazy" alt="" src="${esc(S.urls[p.thumb_path] || "")}">${p.id === coverId ? '<span class="star">대표</span>' : ""}</button>`).join("")}</div>` : ""}
            </article>`;
          }).join("")}
        </div>`;
    }
    s.el.addEventListener("click", async e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a, id = b.dataset.id;
      if (a === "add") editEntry(m, rid, null, after);
      else if (a === "edit") editEntry(m, rid, S.data.entries.find(x => x.id === id), after);
      else if (a === "del") {
        const n = S.data.photos.filter(p => p.entry_id === id).length;
        if (await confirmBox(`이 기록을 삭제할까요?${n ? ` 사진 ${n}장도 함께 지워져요.` : ""}`)) { await store.deleteEntry(id); await after(); toast("기록을 삭제했어요"); }
      } else if (a === "view") viewPhoto(m, rid, S.data.photos.find(p => p.id === id), after);
    });
    async function after() { await refresh(); await draw(); onChange && onChange(); }
    await draw();
  }

  async function viewPhoto(m, rid, p, after) {
    await urlsFor([p], "full");
    const w = document.createElement("div"); w.className = "viewer"; w.setAttribute("role", "dialog");
    const isCover = (coverFor(m.id, rid) || {}).id === p.id;
    w.innerHTML = `<div class="vbar"><button class="iconbtn" data-v="close" aria-label="닫기">${ICON.close}</button><span style="font-size:13px;opacity:.7">${(p.bytes / 1024).toFixed(0)}KB</span><span style="width:44px"></span></div>
      <div class="vimg"><img alt="" src="${esc(S.urls[p.full_path] || S.urls[p.thumb_path])}"></div>
      <div class="vact"><button class="btn" data-v="cover" ${isCover ? "disabled" : ""}>${isCover ? "대표 사진이에요" : "대표 사진으로"}</button><button class="btn" data-v="del" style="color:#ff8a9c">${ICON.trash}삭제</button></div>`;
    document.body.appendChild(w);
    w.addEventListener("click", async e => {
      const b = e.target.closest("[data-v]"); if (!b) return;
      if (b.dataset.v === "close") w.remove();
      else if (b.dataset.v === "cover") { await store.setCover(m.id, rid, p.id); w.remove(); await after(); toast("지도에 이 사진이 보여요"); }
      else if (b.dataset.v === "del") { if (await confirmBox("이 사진을 삭제할까요?")) { await store.deletePhoto(p); w.remove(); await after(); toast("사진을 삭제했어요"); } }
    });
  }

  function editEntry(m, rid, entry, after) {
    const pending = []; // {file, url}
    const removed = new Set();
    const existing = entry ? S.data.photos.filter(p => p.entry_id === entry.id) : [];
    const s = sheet(`
      <div class="sheet-head gutter"><button class="iconbtn" data-close aria-label="닫기">${ICON.close}</button><h2>${entry ? "기록 수정" : "기록 추가"}<small>${esc(regionFull(m, rid))}</small></h2><span></span></div>
      <div class="gutter stack">
        <div class="field"><label for="ee-date">다녀온 날</label><input type="date" id="ee-date" value="${esc(entry ? entry.visited_on || "" : today())}"></div>
        <div class="field"><label for="ee-memo">메모</label><textarea id="ee-memo" maxlength="5000" placeholder="누구랑, 뭐 먹었는지, 기억하고 싶은 것">${esc(entry ? entry.memo : "")}</textarea></div>
        <div class="field"><span class="lbl">사진 (올릴 때 자동으로 0.2MB 안팎으로 줄여요)</span><div class="grid" id="ee-grid"></div>
          <label class="btn block" for="ee-file" style="margin-top:6px">${ICON.photo}사진 고르기</label><input type="file" id="ee-file" accept="image/*" multiple hidden></div>
        <div id="ee-prog" hidden><div class="progress"><i></i></div><p class="lbl" id="ee-ptxt" style="margin:6px 0 0"></p></div>
        <button class="btn primary block" id="ee-save">저장</button>
      </div>`, { full: true });
    const grid = $("#ee-grid", s.el);
    const drawGrid = () => {
      grid.innerHTML = existing.filter(p => !removed.has(p.id)).map(p => `<div class="ph"><img alt="" src="${esc(S.urls[p.thumb_path] || "")}"><button class="rm" data-rmx="${p.id}" aria-label="사진 빼기">×</button></div>`).join("")
        + pending.map((p, i) => `<div class="ph"><img alt="" src="${p.url}"><button class="rm" data-rmp="${i}" aria-label="사진 빼기">×</button></div>`).join("");
    };
    drawGrid();
    grid.onclick = e => {
      const x = e.target.closest("[data-rmx]"), y = e.target.closest("[data-rmp]");
      if (x) removed.add(x.dataset.rmx);
      if (y) { const [p] = pending.splice(+y.dataset.rmp, 1); URL.revokeObjectURL(p.url); }
      if (x || y) drawGrid();
    };
    $("#ee-file", s.el).onchange = e => {
      for (const f of e.target.files) if (f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) pending.push({ file: f, url: URL.createObjectURL(f) });
      e.target.value = ""; drawGrid();
    };
    $("#ee-save", s.el).onclick = async () => {
      const btn = $("#ee-save", s.el); btn.disabled = true;
      const visited_on = $("#ee-date", s.el).value || null, memo = $("#ee-memo", s.el).value;
      const prog = $("#ee-prog", s.el), bar = $(".progress i", s.el), ptxt = $("#ee-ptxt", s.el);
      try {
        let e = entry;
        if (e) await store.updateEntry(e.id, { visited_on, memo });
        else e = await store.createEntry({ map_id: m.id, region_id: rid, visited_on, memo });
        for (const id of removed) { const p = existing.find(x => x.id === id); if (p) await store.deletePhoto(p); }
        if (pending.length) prog.hidden = false;
        let failed = 0;
        for (let i = 0; i < pending.length; i++) {
          ptxt.textContent = `사진 ${i + 1} / ${pending.length} 올리는 중…`; bar.style.width = (i / pending.length * 100) + "%";
          try {
            const c = await window.ImageTools.compress(pending[i].file);
            await store.addPhoto({ map_id: m.id, region_id: rid, entry_id: e.id, width: c.width, height: c.height }, c.thumb, c.full);
          } catch (err) { console.error(err); failed++; }
        }
        bar.style.width = "100%";
        pending.forEach(p => URL.revokeObjectURL(p.url));
        s.close(); await after();
        toast(failed ? `저장했어요. 사진 ${failed}장은 올리지 못했어요.` : "저장했어요", failed ? 4000 : 2400);
      } catch (err) { btn.disabled = false; toast("저장하지 못했어요: " + err.message, 4500); }
    };
  }

  // ───────── timeline tab ─────────
  async function renderTimeline(v) {
    const es = [...S.data.entries].sort((a, b) => ((b.visited_on || "") + b.created_at).localeCompare((a.visited_on || "") + a.created_at));
    if (!es.length) { v.innerHTML = `<div class="empty"><b>아직 기록이 없어요</b>여행지도에서 지역을 눌러 첫 기록을 남겨 보세요.</div>`; return; }
    const firstPhoto = e => S.data.photos.filter(p => p.entry_id === e.id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    await urlsFor(es.map(firstPhoto).filter(Boolean));
    let html = "", month = "";
    for (const e of es) {
      const m = S.data.maps.find(x => x.id === e.map_id); if (!m) continue;
      const mo = e.visited_on ? `${e.visited_on.slice(0, 4)}년 ${+e.visited_on.slice(5, 7)}월` : "날짜 없음";
      if (mo !== month) { if (month) html += `</div>`; html += `<h2 class="month">${mo}</h2><div class="tl">`; month = mo; }
      const p = firstPhoto(e); const n = S.data.photos.filter(x => x.entry_id === e.id).length;
      html += `<button class="tl-item" data-m="${m.id}" data-r="${esc(e.region_id)}"><span class="th">${p ? `<img loading="lazy" alt="" src="${esc(S.urls[p.thumb_path] || "")}">` : ""}</span>
        <span class="tx"><b>${esc(regionFull(m, e.region_id))}</b><span>${fmtDate(e.visited_on)} · ${esc(m.title)}${n ? ` · 사진 ${n}장` : ""}</span>${e.memo ? `<span>${esc(e.memo.split("\n")[0])}</span>` : ""}</span></button>`;
    }
    v.innerHTML = `<div class="stack">${html}</div></div>`;
    v.onclick = e => { const b = e.target.closest("[data-m]"); if (b) openMap(b.dataset.m, b.dataset.r); };
  }

  // ───────── settings tab ─────────
  async function renderSettings(v) {
    const used = S.data.photos.reduce((a, p) => a + (p.bytes || 0), 0);
    const pct = Math.min(100, used / LIMIT * 100);
    const left = Math.max(0, Math.floor((LIMIT - used) / (215 * 1024)));
    const sess = await store.session();
    v.innerHTML = `<div class="stack">
      ${DEMO ? `<div class="banner">체험 모드로 실행 중이에요. 설정 파일에 Supabase 주소를 넣으면 친구와 함께 쓰는 모드로 바뀌어요.</div>` : ""}
      <section class="panel"><h3>저장 공간</h3>
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}" aria-label="사용한 저장 공간"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="meter-row"><span>${fmtMB(used)} 사용</span><span>${fmtMB(LIMIT)} 중</span></div>
        <p>사진 ${S.data.photos.length}장 · 앞으로 약 ${left.toLocaleString("ko-KR")}장 더 올릴 수 있어요.</p></section>
      <section class="panel"><h3>백업</h3>
        <p>모든 기록과 사진을 ZIP 파일 하나로 저장해요. 가끔 만들어 두면 서버에 문제가 생겨도 이 파일로 되살릴 수 있어요.</p>
        <button class="btn block" id="bk-make">백업 파일 만들기</button>
        <label class="btn block" for="bk-file">백업 파일에서 되살리기</label><input type="file" id="bk-file" accept=".zip,application/zip" hidden>
        <div id="bk-prog" hidden><div class="progress"><i></i></div><p class="lbl" id="bk-txt" style="margin:6px 0 0"></p></div></section>
      <section class="panel"><h3>계정</h3><p>${esc(sess ? sess.email : "")}</p>${DEMO ? "" : `<button class="btn block danger" id="logout">로그아웃</button>`}</section>
      <p class="lbl" style="text-align:center">${esc(APP)} · 사진은 폰 사진첩 원본과 별개로 줄여서 저장돼요</p>
    </div>`;
    $("#bk-make", v).onclick = makeBackup;
    $("#bk-file", v).onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) restoreBackup(f); };
    const lo = $("#logout", v); if (lo) lo.onclick = async () => { await store.signOut(); location.reload(); };
  }

  function setProg(frac, text) { const p = $("#bk-prog"); if (!p) return; p.hidden = false; $(".progress i", p).style.width = (frac * 100) + "%"; $("#bk-txt").textContent = text; }

  async function makeBackup() {
    if (!window.JSZip) return toast("백업 도구를 불러오지 못했어요");
    const btn = $("#bk-make"); btn.disabled = true;
    try {
      const zip = new JSZip(); const d = S.data;
      zip.file("data.json", JSON.stringify({ app: "travel-map", version: 1, exported_at: new Date().toISOString(), ...d }, null, 1));
      for (let i = 0; i < d.photos.length; i++) {
        const p = d.photos[i]; setProg(i / Math.max(1, d.photos.length), `사진 ${i + 1} / ${d.photos.length} 담는 중…`);
        const [t, f] = await Promise.all([store.blob(p.thumb_path), store.blob(p.full_path)]);
        if (t) zip.file(`thumbs/${p.id}.jpg`, t); if (f) zip.file(`photos/${p.id}.jpg`, f);
      }
      setProg(1, "파일 만드는 중…");
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `travel-map-backup-${today()}.zip`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setProg(1, `백업 파일을 만들었어요 (${fmtMB(blob.size)}). 다운로드 폴더나 '파일' 앱에서 확인하세요.`);
    } catch (e) { toast("백업하지 못했어요: " + e.message, 4500); }
    btn.disabled = false;
  }

  async function restoreBackup(file) {
    if (!window.JSZip) return toast("백업 도구를 불러오지 못했어요");
    try {
      const zip = await JSZip.loadAsync(file);
      const d = JSON.parse(await zip.file("data.json").async("string"));
      if (d.app !== "travel-map") throw new Error("이 앱의 백업 파일이 아니에요");
      if (!(await confirmBox(`백업에 지도 ${d.maps.length}개, 기록 ${d.entries.length}개, 사진 ${d.photos.length}장이 있어요. 지금 기록에 더해서 되살릴까요?`, "되살리기", false))) return;
      const mapIds = {}, entryIds = {}, photoIds = {};
      for (const m of d.maps) mapIds[m.id] = (await store.createMap(m.kind, m.title)).id;
      for (const e of d.entries) entryIds[e.id] = (await store.createEntry({ map_id: mapIds[e.map_id], region_id: e.region_id, visited_on: e.visited_on, memo: e.memo || "" })).id;
      let i = 0;
      for (const p of d.photos) {
        setProg(i++ / Math.max(1, d.photos.length), `사진 ${i} / ${d.photos.length} 되살리는 중…`);
        const tf = zip.file(`thumbs/${p.id}.jpg`), ff = zip.file(`photos/${p.id}.jpg`); if (!tf || !ff) continue;
        const t = new Blob([await tf.async("uint8array")], { type: "image/jpeg" }), f = new Blob([await ff.async("uint8array")], { type: "image/jpeg" });
        const np = await store.addPhoto({ map_id: mapIds[p.map_id], region_id: p.region_id, entry_id: entryIds[p.entry_id] || null, width: p.width, height: p.height }, t, f);
        photoIds[p.id] = np.id;
      }
      for (const c of d.covers || []) if (photoIds[c.photo_id]) await store.setCover(mapIds[c.map_id], c.region_id, photoIds[c.photo_id]);
      setProg(1, "되살리기를 마쳤어요");
      await refresh(); toast("백업에서 되살렸어요");
    } catch (e) { toast("되살리지 못했어요: " + e.message, 4500); }
  }

  // ───────── login ─────────
  function login(msg) {
    let signup = false;
    root.innerHTML = `<div class="login gutter"><form class="box" id="lg" novalidate>
      <h1>${esc(APP)}</h1><p id="lg-sub">우리 둘만 쓰는 여행 기록</p>
      <div class="field"><label for="lg-email">이메일</label><input id="lg-email" type="email" autocomplete="email" required placeholder="네이버, 구글 등 아무 이메일"></div>
      <div class="field"><label for="lg-pw">비밀번호</label><input id="lg-pw" type="password" autocomplete="current-password" minlength="6" required placeholder="6자 이상"></div>
      <p class="err" id="lg-err" ${msg ? "" : "hidden"}>${esc(msg || "")}</p>
      <button class="btn primary block" id="lg-go">로그인</button>
      <button type="button" class="btn block" id="lg-mode">처음이에요 (가입하기)</button></form></div>`;
    const err = $("#lg-err");
    $("#lg-mode").onclick = () => {
      signup = !signup;
      $("#lg-go").textContent = signup ? "가입하고 시작하기" : "로그인";
      $("#lg-mode").textContent = signup ? "이미 가입했어요 (로그인)" : "처음이에요 (가입하기)";
      $("#lg-pw").autocomplete = signup ? "new-password" : "current-password";
    };
    $("#lg").onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      const email = $("#lg-email").value.trim().toLowerCase(), pw = $("#lg-pw").value;
      if (!email || pw.length < 6) { err.textContent = "이메일과 6자 이상 비밀번호를 입력해 주세요."; err.hidden = false; return; }
      $("#lg-go").disabled = true;
      try { signup ? await store.signUp(email, pw) : await store.signIn(email, pw); await start(); }
      catch (x) {
        const m = x.message || "";
        err.textContent = /Invalid login/i.test(m) ? "이메일이나 비밀번호가 맞지 않아요." : /already registered/i.test(m) ? "이미 가입된 이메일이에요. 로그인해 주세요." : /Signups not allowed/i.test(m) ? "새 가입이 막혀 있어요. 등록된 계정으로 로그인해 주세요." : m;
        err.hidden = false; $("#lg-go").disabled = false;
      }
    };
  }

  // ───────── demo seed ─────────
  async function seedDemo() {
    const swatch = (label, hue) => new Promise(res => {
      const c = document.createElement("canvas"); c.width = 800; c.height = 600; const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 800, 600); g.addColorStop(0, `hsl(${hue},70%,62%)`); g.addColorStop(1, `hsl(${(hue + 50) % 360},65%,40%)`);
      x.fillStyle = g; x.fillRect(0, 0, 800, 600);
      x.fillStyle = "rgba(255,255,255,.18)"; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(120 + i * 110, 470 - (i % 3) * 60, 90 + (i % 2) * 40, 0, 7); x.fill(); }
      x.fillStyle = "#fff"; x.font = "600 64px sans-serif"; x.textAlign = "center"; x.fillText(label, 400, 290); x.font = "28px sans-serif"; x.fillText("예시 사진", 400, 350);
      c.toBlob(b => res(b), "image/jpeg", 0.8);
    });
    const add = async (m, rid, date, memo, label, hue) => {
      const e = await store.createEntry({ map_id: m.id, region_id: rid, visited_on: date, memo });
      const b = await swatch(label, hue); const c = await window.ImageTools.compress(b);
      await store.addPhoto({ map_id: m.id, region_id: rid, entry_id: e.id, width: c.width, height: c.height }, c.thumb, c.full);
    };
    const kr = await store.createMap("kr", "국내 여행지도");
    await add(kr, "kr-26", "2026-08-14", "(예시) 광안리 야경, 밀면 두 그릇", "부산", 200);
    await add(kr, "kr-50110", "2026-05-02", "(예시) 협재 바다", "제주", 170);
    await add(kr, "kr-51150", "2026-01-11", "(예시) 안목해변 커피거리", "강릉", 230);
    await add(kr, "kr-47130", "2025-10-03", "(예시) 황리단길, 첨성대", "경주", 30);
    await add(kr, "kr-11", "2026-03-21", "(예시) 성수동 산책", "서울", 280);
    await add(kr, "kr-46130", "2025-07-19", "(예시) 낭만포차", "여수", 320);
    const w = await store.createMap("world", "세계 여행지도");
    await add(w, "w-392", "2025-12-24", "(예시) 오사카 도톤보리", "일본", 350);
    await add(w, "w-704", "2026-02-10", "(예시) 다낭 미케비치", "베트남", 140);
    await add(w, "w-250", "2024-09-05", "(예시) 파리 에펠탑", "프랑스", 250);
    await add(w, "w-036", "2023-12-30", "(예시) 시드니 새해 불꽃", "호주", 40);
  }

  // ───────── boot ─────────
  async function loadGeo() {
    if (window.__MAPDATA) { S.geo = window.__MAPDATA; return; }
    const [kr, world, seoul] = await Promise.all(["data/kr.json", "data/world.json", "data/seoul.json"].map(u => fetch(u).then(r => r.json())));
    S.geo = { kr, world, seoul };
  }
  async function start() {
    if (!DEMO) {
      const sess = await store.session();
      if (!sess) return login();
      let ok = false; try { ok = await store.isMember(); } catch (e) { return login("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요. (" + e.message + ")"); }
      if (!ok) { await store.signOut(); return login("이 이메일은 앱 멤버로 등록되어 있지 않아요. 설정 가이드의 '멤버 이메일'을 확인해 주세요."); }
    }
    await refresh();
    shell();
  }
  async function boot() {
    root.innerHTML = `<div class="empty" style="padding-top:40vh">불러오는 중…</div>`;
    try {
      await loadGeo();
      const r = await store.init();
      if (DEMO && !r.seeded) await seedDemo();
      await start();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="empty gutter" style="padding-top:30vh"><b>앱을 열지 못했어요</b>${esc(e.message)}<br><br><button class="btn" onclick="location.reload()">다시 시도</button></div>`;
    }
  }
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && !DEMO && root.querySelector(".tabbar") && !document.querySelector(".sheet-wrap,.mapview,.viewer")) {
      try { await refresh(); render(); } catch (e) { /* offline */ }
    }
  });
  boot();
})();
