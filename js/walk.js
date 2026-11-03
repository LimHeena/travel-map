// 발자취: GPX 파일을 읽어서 경로·머문 곳·시간·거리를 계산해요.
(function () {
  const R = Math.PI / 180;
  const STAY_RADIUS = 60;          // m — 이 반경 안에 오래 있으면 '머문 곳'
  const STAY_MIN = 8 * 60;         // s — 최소 머문 시간
  const GAP_BREAK = 5 * 60;        // s — 이보다 길게 기록이 끊기면 선을 잇지 않음
  const SIMPLIFY_M = 3;            // m — 선 단순화 허용 오차

  function dist(a, b) { // haversine, meters
    const dLat = (b[0] - a[0]) * R, dLon = (b[1] - a[1]) * R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // ── GPX 읽기 ──
  function parseGPX(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("GPX 파일을 읽지 못했어요");
    const segs = [];
    const take = nodes => {
      const pts = [];
      for (const n of nodes) {
        const lat = parseFloat(n.getAttribute("lat")), lon = parseFloat(n.getAttribute("lon"));
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const te = n.getElementsByTagName("time")[0];
        const t = te ? Date.parse(te.textContent.trim()) : NaN;
        pts.push([lat, lon, isFinite(t) ? t / 1000 : null]);
      }
      return pts;
    };
    for (const s of doc.getElementsByTagName("trkseg")) { const p = take(s.getElementsByTagName("trkpt")); if (p.length) segs.push(p); }
    if (!segs.length) for (const r of doc.getElementsByTagName("rte")) { const p = take(r.getElementsByTagName("rtept")); if (p.length) segs.push(p); }
    if (!segs.length) throw new Error("파일 안에 경로가 없어요");
    const nameEl = doc.querySelector("trk > name, metadata > name");
    return { segs, name: nameEl ? nameEl.textContent.trim() : "" };
  }

  // ── 튀는 점 제거 ──
  function clean(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q) {
        const d = dist(q, p);
        if (d < 1) continue;
        if (p[2] != null && q[2] != null && p[2] > q[2] && d / (p[2] - q[2]) > 60) continue; // 순간이동
      }
      out.push(p);
    }
    return out;
  }

  // ── Douglas–Peucker (미터 기준) ──
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const lat0 = pts[0][0] * R, mx = 6371000 * Math.cos(lat0) * R, my = 6371000 * R;
    const xy = pts.map(p => [p[1] * mx, p[0] * my]);
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let best = -1, bi = -1;
      const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
      for (let i = a + 1; i < b; i++) {
        const t = Math.max(0, Math.min(1, ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / L));
        const ex = ax + t * dx - xy[i][0], ey = ay + t * dy - xy[i][1], d = ex * ex + ey * ey;
        if (d > best) { best = d; bi = i; }
      }
      if (best > tol * tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  // ── 분석: 머문 곳 찾기, 선 나누기, 시간·거리 ──
  function analyze(parsed) {
    const segsIn = parsed.segs.map(clean).filter(s => s.length);
    const all = []; segsIn.forEach((s, si) => s.forEach(p => all.push({ p, si })));
    if (all.length < 2) throw new Error("경로 점이 너무 적어요");
    const hasTime = all.every(x => x.p[2] != null);
    const inStay = new Int32Array(all.length).fill(-1);
    const stays = [];
    if (hasTime) {
      let i = 0;
      while (i < all.length) {
        let j = i;
        while (j + 1 < all.length && dist(all[i].p, all[j + 1].p) <= STAY_RADIUS) j++;
        if (j > i && all[j].p[2] - all[i].p[2] >= STAY_MIN) {
          let la = 0, lo = 0; for (let k = i; k <= j; k++) { la += all[k].p[0]; lo += all[k].p[1]; inStay[k] = stays.length; }
          const n = j - i + 1;
          stays.push({ lat: +(la / n).toFixed(6), lon: +(lo / n).toFixed(6), start: all[i].p[2], end: all[j].p[2], memo: "" });
          i = j + 1;
        } else i++;
      }
      // 실내에서 GPS가 끊긴 경우: 오래 끊겼는데 거의 안 움직였으면 머문 곳
      for (let k = 0; k + 1 < all.length; k++) {
        const a = all[k].p, b = all[k + 1].p;
        if (inStay[k] < 0 && inStay[k + 1] < 0 && b[2] - a[2] >= STAY_MIN && dist(a, b) < 250) {
          stays.push({ lat: +((a[0] + b[0]) / 2).toFixed(6), lon: +((a[1] + b[1]) / 2).toFixed(6), start: a[2], end: b[2], memo: "" });
        }
      }
      stays.sort((x, y) => x.start - y.start);
      // 가까운 시간·장소의 머문 곳은 하나로 합쳐요 (GPS 흔들림 때문에 나뉜 경우)
      for (let k = stays.length - 1; k > 0; k--) {
        const a = stays[k - 1], b = stays[k];
        if (b.start - a.end < 180 && dist([a.lat, a.lon], [b.lat, b.lon]) < 120) {
          const wa = a.end - a.start, wb = b.end - b.start, W = wa + wb || 1;
          a.lat = +((a.lat * wa + b.lat * wb) / W).toFixed(6); a.lon = +((a.lon * wa + b.lon * wb) / W).toFixed(6);
          a.end = Math.max(a.end, b.end); stays.splice(k, 1);
          for (let q = 0; q < inStay.length; q++) if (inStay[q] === k) inStay[q] = k - 1; else if (inStay[q] > k) inStay[q]--;
        }
      }
      // 합쳐진 머문 곳 사이의 짧은 점들도 선에서 빼요
      for (let q = 1; q < all.length - 1; q++) {
        if (inStay[q] >= 0 || !all[q].p[2]) continue;
        const st = stays.find(x => x.start <= all[q].p[2] && all[q].p[2] <= x.end);
        if (st) inStay[q] = stays.indexOf(st);
      }
    }
    // 그릴 선: 머문 곳·끊긴 구간·원래 구간 경계에서 나눔
    const lines = []; let cur = [];
    const flush = () => { if (cur.length >= 2) lines.push(cur); cur = []; };
    for (let k = 0; k < all.length; k++) {
      const x = all[k], prev = all[k - 1];
      if (inStay[k] >= 0) { flush(); continue; }
      if (prev && (prev.si !== x.si || inStay[k - 1] >= 0 || (hasTime && x.p[2] - prev.p[2] > GAP_BREAK))) flush();
      cur.push(x.p);
    }
    flush();
    const simple = lines.map(l => simplify(l, SIMPLIFY_M)).filter(l => l.length >= 2);
    let distance = 0; for (const l of simple) for (let k = 1; k < l.length; k++) distance += dist(l[k - 1], l[k]);
    const start = hasTime ? all[0].p[2] : null, end = hasTime ? all[all.length - 1].p[2] : null;
    const stay_s = stays.reduce((a, s) => a + (s.end - s.start), 0);
    let minLa = 90, minLo = 180, maxLa = -90, maxLo = -180;
    for (const l of simple) for (const p of l) { minLa = Math.min(minLa, p[0]); maxLa = Math.max(maxLa, p[0]); minLo = Math.min(minLo, p[1]); maxLo = Math.max(maxLo, p[1]); }
    for (const s of stays) { minLa = Math.min(minLa, s.lat); maxLa = Math.max(maxLa, s.lat); minLo = Math.min(minLo, s.lon); maxLo = Math.max(maxLo, s.lon); }
    const t0 = start || 0;
    return {
      started_at: start ? new Date(start * 1000).toISOString() : null,
      ended_at: end ? new Date(end * 1000).toISOString() : null,
      distance_m: Math.round(distance),
      stay_s: Math.round(stay_s),
      moving_s: hasTime ? Math.max(0, Math.round(end - start - stay_s)) : null,
      track: { v: 1, segs: simple.map(l => ({ p: encode(l), t: hasTime ? l.map(p => Math.round(p[2] - t0)) : null })) },
      stays: stays.map(s => ({ ...s, start: new Date(s.start * 1000).toISOString(), end: new Date(s.end * 1000).toISOString() })),
      bbox: [minLa, minLo, maxLa, maxLo].map(v => +v.toFixed(5)),
      source_key: hasTime ? `${Math.round(start)}-${all.length}` : `${all[0].p[0]},${all[0].p[1]}-${all.length}`,
      points: all.length,
    };
  }

  // ── Google polyline (정밀도 5 ≈ 1m) ──
  function encode(pts) {
    let out = "", pa = 0, po = 0;
    const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
    for (const p of pts) { const a = Math.round(p[0] * 1e5), o = Math.round(p[1] * 1e5); out += enc(a - pa) + enc(o - po); pa = a; po = o; }
    return out;
  }
  function decode(str) {
    const pts = []; let i = 0, la = 0, lo = 0;
    const dec = () => { let r = 0, s = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
    while (i < str.length) { la += dec(); lo += dec(); pts.push([la / 1e5, lo / 1e5]); }
    return pts;
  }

  // ── 지도 좌표 변환 (지도 데이터와 같은 투영) ──
  function projector(proj) {
    if (proj.type === "merc") return (lat, lon) => [proj.tx + proj.k * lon * R, proj.ty - proj.k * Math.log(Math.tan(Math.PI / 4 + lat * R / 2))];
    return (lat, lon) => { // Natural Earth I
      const l = lon * R, p = lat * R, p2 = p * p, p4 = p2 * p2;
      const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
      const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
      return [proj.tx + proj.k * x, proj.ty - proj.k * y];
    };
  }
  function pathD(walk, proj) {
    const f = projector(proj); let d = "";
    for (const s of walk.track.segs) { const pts = decode(s.p); d += pts.map((p, i) => { const [x, y] = f(p[0], p[1]); return (i ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2); }).join(""); }
    return d;
  }

  window.Walk = { parseGPX, analyze, decode, projector, pathD, dist };
})();
