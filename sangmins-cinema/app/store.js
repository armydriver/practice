/* ===========================================================
   app/store.js  —  사용자 평가/추천 이력 저장소
   -----------------------------------------------------------
   * 저장 위치: 브라우저 localStorage (키: sangmins-cinema-v1)
   * JSON 내보내기/불러오기로 나중에 서버·DB로 옮기기 쉽게 설계.
   =========================================================== */
window.CinemaStore = (function () {
  const KEY = 'sangmins-cinema-v1';
  const EMPTY = { version: 1, ratings: {}, favorites: [], history: [] };

  let db = load();

  // 시드 데이터(data/ratings.js)가 있으면 최초 상태로 사용
  function seeded() {
    const s = Object.assign({}, EMPTY);
    if (window.SEED_RATINGS) s.ratings = JSON.parse(JSON.stringify(window.SEED_RATINGS));
    if (window.SEED_FAVORITES) s.favorites = window.SEED_FAVORITES.slice();
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seeded();
      const p = JSON.parse(raw);
      return {
        version: 1,
        ratings: p.ratings || {},
        favorites: p.favorites || [],
        history: p.history || []
      };
    } catch (e) {
      return seeded();
    }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 저장 불가 환경 */ }
  }

  return {
    raw: () => db,
    all: () => db.ratings,
    get: id => db.ratings[id] || null,

    setRating(id, reaction, dims) {
      const prev = db.ratings[id] || {};
      db.ratings[id] = {
        reaction: reaction || prev.reaction || null,
        dims: dims || prev.dims || {},
        at: new Date().toISOString()
      };
      persist();
      return db.ratings[id];
    },
    setDims(id, dims) {
      const prev = db.ratings[id] || {};
      db.ratings[id] = { reaction: prev.reaction || null, dims: dims, at: new Date().toISOString() };
      persist();
      return db.ratings[id];
    },
    clearRating(id) { delete db.ratings[id]; persist(); },

    isFavorite: id => db.favorites.indexOf(id) >= 0,
    toggleFavorite(id) {
      const i = db.favorites.indexOf(id);
      if (i >= 0) db.favorites.splice(i, 1); else db.favorites.push(id);
      persist();
      return db.favorites.indexOf(id) >= 0;
    },
    favorites: () => db.favorites.slice(),

    addHistory(entry) {
      db.history.unshift(Object.assign({ at: new Date().toISOString() }, entry));
      db.history = db.history.slice(0, 40);
      persist();
    },
    history: () => db.history.slice(),
    clearHistory() { db.history = []; persist(); },

    exportJSON() { return JSON.stringify(db, null, 2); },
    importJSON(text) {
      const p = JSON.parse(text);
      db = { version: 1, ratings: p.ratings || {}, favorites: p.favorites || [], history: p.history || [] };
      persist();
      return db;
    },
    reset() { db = JSON.parse(JSON.stringify(EMPTY)); persist(); }
  };
})();
