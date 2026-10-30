// 저장소 두 가지: Supabase(친구와 공유) / 이 기기(체험 모드). 앱은 같은 함수로 둘 다 사용해요.
(function () {
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const now = () => new Date().toISOString();

  // ───────────── 체험 모드: IndexedDB(안 되면 메모리) ─────────────
  function LocalStore() {
    let db = null;
    let data = { maps: [], entries: [], photos: [], covers: [] };
    const mem = new Map();
    const urlCache = new Map();

    function idb() {
      return new Promise((res) => {
        try {
          const rq = indexedDB.open("travel-map-demo", 1);
          rq.onupgradeneeded = () => { rq.result.createObjectStore("kv"); rq.result.createObjectStore("blobs"); };
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
    }
    function tx(store, mode, fn) {
      return new Promise((res) => {
        if (!db) return res(fn(null));
        try {
          const t = db.transaction(store, mode); const s = t.objectStore(store);
          const r = fn(s);
          t.oncomplete = () => res(r && r.result !== undefined ? r.result : r);
          t.onerror = () => res(null);
        } catch (e) { res(null); }
      });
    }
    const save = () => tx("kv", "readwrite", s => s && s.put(JSON.parse(JSON.stringify(data)), "data"));
    const putBlob = (k, b) => { mem.set(k, b); return tx("blobs", "readwrite", s => s && s.put(b, k)); };
    const getBlob = async (k) => mem.get(k) || (await tx("blobs", "readonly", s => s && s.get(k)));
    const delBlob = (k) => { mem.delete(k); return tx("blobs", "readwrite", s => s && s.delete(k)); };

    return {
      mode: "local",
      async init() {
        db = await idb();
        const saved = await tx("kv", "readonly", s => s && s.get("data"));
        if (saved && saved.maps) data = saved;
        return { seeded: !!(saved && saved.maps) };
      },
      async session() { return { email: "체험 모드" }; },
      async signIn() {}, async signUp() {}, async signOut() {}, async isMember() { return true; },
      async getAll() { return JSON.parse(JSON.stringify(data)); },
      async createMap(kind, title) { const m = { id: uid(), kind, title, created_at: now() }; data.maps.push(m); await save(); return m; },
      async updateMap(id, patch) { Object.assign(data.maps.find(m => m.id === id), patch); await save(); },
      async deleteMap(id) {
        for (const p of data.photos.filter(p => p.map_id === id)) { await delBlob(p.thumb_path); await delBlob(p.full_path); }
        data.photos = data.photos.filter(p => p.map_id !== id);
        data.entries = data.entries.filter(e => e.map_id !== id);
        data.covers = data.covers.filter(c => c.map_id !== id);
        data.maps = data.maps.filter(m => m.id !== id); await save();
      },
      async createEntry(e) { const r = { id: uid(), created_at: now(), memo: "", ...e }; data.entries.push(r); await save(); return r; },
      async updateEntry(id, patch) { Object.assign(data.entries.find(e => e.id === id), patch); await save(); },
      async deleteEntry(id) {
        for (const p of data.photos.filter(p => p.entry_id === id)) await this.deletePhoto(p, true);
        data.entries = data.entries.filter(e => e.id !== id); await save();
      },
      async addPhoto(meta, thumb, full) {
        const id = uid();
        const p = { id, ...meta, thumb_path: `${meta.map_id}/${id}_t.jpg`, full_path: `${meta.map_id}/${id}_f.jpg`, bytes: thumb.size + full.size, created_at: meta.created_at || now() };
        await putBlob(p.thumb_path, thumb); await putBlob(p.full_path, full);
        data.photos.push(p); await save(); return p;
      },
      async deletePhoto(p, skipSave) {
        await delBlob(p.thumb_path); await delBlob(p.full_path);
        data.photos = data.photos.filter(x => x.id !== p.id);
        data.covers = data.covers.filter(c => c.photo_id !== p.id);
        if (!skipSave) await save();
      },
      async setCover(map_id, region_id, photo_id) {
        data.covers = data.covers.filter(c => !(c.map_id === map_id && c.region_id === region_id));
        if (photo_id) data.covers.push({ map_id, region_id, photo_id });
        await save();
      },
      async urls(paths) {
        const out = {};
        for (const k of paths) {
          if (!urlCache.has(k)) { const b = await getBlob(k); if (b) urlCache.set(k, URL.createObjectURL(b)); }
          if (urlCache.has(k)) out[k] = urlCache.get(k);
        }
        return out;
      },
      async blob(path) { return getBlob(path); },
    };
  }

  // ───────────── Supabase: 친구와 함께 쓰는 서버 ─────────────
  function SupabaseStore(cfg) {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const bucket = () => sb.storage.from("photos");
    const urlCache = new Map(); // path -> {url, exp}
    const must = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

    async function all(table) {
      const rows = []; const size = 1000;
      for (let from = 0; ; from += size) {
        const d = must(await sb.from(table).select("*").order("created_at", { ascending: true }).range(from, from + size - 1));
        rows.push(...d); if (d.length < size) break;
      }
      return rows;
    }
    async function removePaths(paths) {
      for (let i = 0; i < paths.length; i += 100) { const r = await bucket().remove(paths.slice(i, i + 100)); if (r.error) console.warn(r.error); }
    }

    return {
      mode: "supabase",
      sb,
      async init() { return {}; },
      async session() { const { data } = await sb.auth.getSession(); return data.session ? { email: data.session.user.email } : null; },
      async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
      async signUp(email, password) {
        const d = must(await sb.auth.signUp({ email, password }));
        if (!d.session) throw new Error("가입은 됐지만 이메일 확인이 켜져 있어요. 설정 가이드의 'Confirm email 끄기'를 확인해 주세요.");
      },
      async signOut() { await sb.auth.signOut(); },
      async isMember() { const d = must(await sb.rpc("is_member")); return !!d; },
      async getAll() {
        const [maps, entries, photos, covers] = await Promise.all(["maps", "entries", "photos", "covers"].map(all));
        return { maps, entries, photos, covers };
      },
      async createMap(kind, title) { return must(await sb.from("maps").insert({ kind, title }).select().single()); },
      async updateMap(id, patch) { must(await sb.from("maps").update(patch).eq("id", id)); },
      async deleteMap(id) {
        const ps = must(await sb.from("photos").select("thumb_path,full_path").eq("map_id", id));
        await removePaths(ps.flatMap(p => [p.thumb_path, p.full_path]));
        must(await sb.from("maps").delete().eq("id", id));
      },
      async createEntry(e) { return must(await sb.from("entries").insert(e).select().single()); },
      async updateEntry(id, patch) { must(await sb.from("entries").update(patch).eq("id", id)); },
      async deleteEntry(id) {
        const ps = must(await sb.from("photos").select("thumb_path,full_path").eq("entry_id", id));
        await removePaths(ps.flatMap(p => [p.thumb_path, p.full_path]));
        must(await sb.from("entries").delete().eq("id", id));
      },
      async addPhoto(meta, thumb, full) {
        const id = uid();
        const thumb_path = `${meta.map_id}/${id}_t.jpg`, full_path = `${meta.map_id}/${id}_f.jpg`;
        const opt = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
        must(await bucket().upload(thumb_path, thumb, opt));
        must(await bucket().upload(full_path, full, opt));
        const row = { id, ...meta, thumb_path, full_path, bytes: thumb.size + full.size };
        try { return must(await sb.from("photos").insert(row).select().single()); }
        catch (e) { await removePaths([thumb_path, full_path]); throw e; }
      },
      async deletePhoto(p) {
        await removePaths([p.thumb_path, p.full_path]);
        must(await sb.from("photos").delete().eq("id", p.id));
      },
      async setCover(map_id, region_id, photo_id) {
        must(await sb.from("covers").delete().eq("map_id", map_id).eq("region_id", region_id));
        if (photo_id) must(await sb.from("covers").insert({ map_id, region_id, photo_id }));
      },
      async urls(paths) {
        const out = {}, need = [], t = Date.now();
        for (const k of paths) { const c = urlCache.get(k); if (c && c.exp > t) out[k] = c.url; else need.push(k); }
        for (let i = 0; i < need.length; i += 200) {
          const d = must(await bucket().createSignedUrls(need.slice(i, i + 200), 60 * 60 * 24 * 7));
          for (const r of d) if (r.signedUrl) { urlCache.set(r.path, { url: r.signedUrl, exp: t + 1000 * 60 * 60 * 24 * 6 }); out[r.path] = r.signedUrl; }
        }
        return out;
      },
      async blob(path) { return must(await bucket().download(path)); },
    };
  }

  window.Stores = { LocalStore, SupabaseStore, uid };
})();
