/* ===========================================================
   app/ui.js  —  화면 렌더링 · 상호작용
   =========================================================== */
window.CinemaUI = (function () {
  const E = window.CinemaEngine, S = window.CinemaStore, M = window.MOVIES, T = window.TAXONOMY;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const state = { view: 'home', filter: 'all', query: '', lastReco: null, draft: null };
  let PROF = null;

  /* ---------- 포스터(그라디언트 폴백 포함) ---------- */
  function hueOf(str) {
    let h = 0;
    for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360;
    return h;
  }
  function posterInner(film) {
    const hue = hueOf(film.title);
    const year = String(film.year || '').replace(/[^0-9–\-]/g, '');
    return (
      '<div class="poster-gen" style="--h:' + hue + '">' +
        '<div class="pg-top">Sangmin\u2019s Cinema</div>' +
        '<div class="pg-mid">' +
          '<div class="pg-title">' + esc(film.title) + '</div>' +
          (film.ko ? '<span class="pg-ko">' + esc(film.ko) + '</span>' : '') +
        '</div>' +
        '<div class="pg-bot"><span>' + esc((film.genres || [])[0] || '') + '</span>' +
          '<span class="pg-year">' + esc(year) + '</span></div>' +
      '</div>'
    );
  }
  function posterHTML(film) {
    if (film.poster) {
      return '<img src="' + esc(film.poster) + '" alt="' + esc(film.title) + ' 포스터" loading="lazy" ' +
        'onerror="this.style.display=\'none\';this.parentNode.insertAdjacentHTML(\'beforeend\',this.dataset.fb)" ' +
        'data-fb="' + esc(posterInner(film)) + '">';
    }
    return posterInner(film);
  }

  /* ---------- 라벨 ---------- */
  const CAT_BADGE = {
    favorite: { txt: '⭐ FAVORITE', cls: 'fav' },
    loved: { txt: '❤️ LOVED', cls: 'loved' },
    craft: { txt: '🏆 명작 인정', cls: 'okay' },
    craftLow: { txt: '🤔 취향 아님', cls: 'bad' },
    disliked: { txt: '👎 별로였음', cls: 'bad' },
    user_loved: { txt: '내 평가 · ❤️', cls: 'loved' },
    user_liked: { txt: '내 평가 · 👍', cls: 'loved' },
    user_okay: { txt: '내 평가 · 😐', cls: 'okay' },
    user_didntlike: { txt: '내 평가 · 👎', cls: 'bad' },
    user_hated: { txt: '내 평가 · 💀', cls: 'bad' }
  };
  function badgeHTML(film, extraFit) {
    let html = '';
    const b = CAT_BADGE[film.category];
    if (b) html += '<span class="badge ' + b.cls + '">' + b.txt + '</span>';
    if (extraFit != null) html += '<span class="badge fit">' + extraFit + '%</span>';
    return html;
  }
  function bucketOf(film) {
    if (film.userReaction) return ({ loved: 'loved', liked: 'liked', okay: 'okay', didntlike: 'didntlike', hated: 'hated' })[film.userReaction];
    switch (film.category) {
      case 'favorite': case 'loved': return 'loved';
      case 'craft': return 'liked';
      case 'craftLow': return 'didntlike';
      case 'disliked': return 'hated';
      default: return 'loved';
    }
  }

  /* ---------- 카드 ---------- */
  function cardHTML(film, fit) {
    const sub = esc(film.year) + ' · ' + esc(film.director) + '<br>' + esc((film.genres || []).join(' · '));
    const tags = (T.TASTE.filter(a => film.tags[a.key] >= 0.75).slice(0, 2).map(a => '<span class="tchip gold">' + esc(a.label) + '</span>'));
    const risk = (T.AVOID.filter(a => film.avoid[a.key] >= 0.7).slice(0, 1).map(a => '<span class="tchip red">' + esc(a.ko) + '</span>'));
    return (
      '<button class="mcard" data-id="' + esc(film.id) + '">' +
        '<div class="poster">' + badgeHTML(film, fit) + posterHTML(film) + '</div>' +
        '<div class="mcard-body">' +
          '<p class="mcard-title">' + esc(film.title) + '</p>' +
          '<p class="mcard-sub">' + sub + '</p>' +
          '<div class="tags-line">' + tags.join('') + risk.join('') + '</div>' +
        '</div>' +
      '</button>'
    );
  }

  /* ---------- DNA 바 ---------- */
  function barHTML(label, val, ko) {
    const pct = Math.round(val * 100);
    return (
      '<div class="dna-row">' +
        '<div class="dna-top"><b>' + esc(label) + '</b><span>' + pct + '%' + (ko ? ' · ' + esc(ko) : '') + '</span></div>' +
        '<div class="dna-track"><div class="dna-fill" style="width:' + pct + '%"></div></div>' +
      '</div>'
    );
  }

  /* ---------- 홈 ---------- */
  function renderHome() {
    const hist = S.history();
    const prof = PROF;
    $('#hero-meta').innerHTML =
      '<div class="stat"><b>' + prof.counts.watched + '</b><span>감상 영화</span></div>' +
      '<div class="stat"><b>' + prof.counts.loved + '</b><span>좋아하는 영화</span></div>' +
      '<div class="stat"><b>' + prof.counts.candidates + '</b><span>추천 후보</span></div>' +
      '<div class="stat"><b>' + prof.counts.rated + '</b><span>내가 남긴 평가</span></div>';

    // DNA 상위 6축 — 좋아하는 영화에서만 뚜렷하게 높은 축(취향 신호)
    const top = T.TASTE.slice().sort((a, b) => prof.signal[b.key] - prof.signal[a.key]).slice(0, 6);
    $('#dna-grid').innerHTML = top.map(a => barHTML(a.label, prof.signal[a.key],
      '선호 ' + Math.round(prof.tasteAdj[a.key] * 100) + '% · 비선호 ' + Math.round(prof.negTaste[a.key] * 100) + '%')).join('');

    // 즐겨찾기 레일
    const favIds = S.favorites();
    const favs = prof.pool.watched
      .filter(f => f.category === 'favorite' || favIds.indexOf(f.id) >= 0)
      .slice(0, 14);
    $('#rail-favorites').innerHTML = favs.length ? favs.map(f => cardHTML(f, null)).join('')
      : '<div class="empty">아직 즐겨찾기가 없습니다. 영화 카드에서 ⭐ 버튼으로 추가할 수 있습니다.</div>';

    // 최근 추천
    $('#rec-count').textContent = hist.length + '편';
    if (!hist.length) {
      $('#recent-list').innerHTML = '<div class="empty">아직 추천 기록이 없습니다. 위의 버튼으로 오늘 볼 영화를 추천받아 보세요.</div>';
    } else {
      const byId = {};
      M.LIBRARY.concat(M.CANDIDATES).forEach(f => byId[f.id] = f);
      $('#recent-list').innerHTML = hist.map(h => {
        const f = byId[h.id];
        if (!f) return '';
        const r = S.get(h.id);
        const rl = r && r.reaction ? E.REACTION[r.reaction].label : '평가 전';
        const d = String(h.at).slice(0, 10);
        return (
          '<div class="rec" data-id="' + esc(f.id) + '" role="button" tabindex="0">' +
            '<div class="poster">' + posterHTML(f) + '</div>' +
            '<div>' +
              '<p class="rec-t">' + esc(f.title) + '</p>' +
              '<p class="rec-s">' + esc(f.year) + ' · ' + esc(f.director) + ' · ' + d + '<br>' + esc(rl) + '</p>' +
            '</div>' +
            '<div class="rec-right"><div class="fit-big">' + (h.fit || 0) + '%</div>' +
              '<div class="fit-lbl">추천 적합도</div></div>' +
          '</div>'
        );
      }).join('');
    }
  }

  /* ---------- 프로필 ---------- */
  function renderProfile() {
    const prof = PROF;
    $('#profile-bars').innerHTML = T.TASTE.map(a => barHTML(a.label, prof.signal[a.key],
      '선호 ' + Math.round(prof.tasteAdj[a.key] * 100) + '% · 비선호 ' + Math.round(prof.negTaste[a.key] * 100) + '%')).join('');
    $('#profile-disclaimer').textContent =
      M.META.disclaimer + ' 막대는 취향 신호 강도입니다 (50% = 좋아하는 영화와 별로였던 영화에서 비슷한 수준, 100% = 좋아하는 영화에서만 뚜렷하게 높음). ' +
      '선호/비선호 수치는 각각 좋아하는 영화·별로였던 영화의 카테고리 가중 평균이고, 저장한 요소별 평가가 축당 최대 ±0.12 추가 반영됩니다.';
    $('#avoid-bars').innerHTML = T.AVOID
      .slice().sort((a, b) => prof.avoidPref[b.key] - prof.avoidPref[a.key])
      .map(a => barHTML(a.label, prof.avoidPref[a.key], a.ko)).join('');

    const rows = prof.pool.watched.map(f => {
      const dir = f.weight > 0 ? '긍정' : '부정';
      const cls = f.weight >= 1.3 ? 'w-fav' : f.weight > 0 ? 'w-loved' : f.category === 'craftLow' ? 'w-mcraft' : 'w-dis';
      const wlabel = f.category === 'craft' ? '+0.30 (완성도 축)' : (f.weight > 0 ? '+' : '') + f.weight.toFixed(2);
      return '<tr><td><b>' + esc(f.title) + '</b><br><span style="color:var(--txt-faint)">' + esc((f.genres || []).join(' · ')) + '</span></td>' +
        '<td>' + esc(f.year) + '</td><td>' + esc(f.director) + '</td>' +
        '<td>' + esc(M.CATEGORY_LABEL[f.userReaction ? ('loved') : f.category] || '') +
        (f.userReaction ? ' 내 평가' : '') + '</td>' +
        '<td><span class="wchip ' + cls + '">' + dir + ' ' + wlabel + '</span></td>' +
        '<td>' + T.TASTE.slice().sort((a, b) => f.tags[b.key] - f.tags[a.key]).slice(0, 3).map(a => esc(a.label)).join(', ') + '</td></tr>';
    }).join('');
    $('#tbl-contrib').innerHTML =
      '<thead><tr><th>영화</th><th>연도</th><th>감독</th><th>분류</th><th>가중치</th><th>주요 태그</th></tr></thead><tbody>' + rows + '</tbody>';

    $('#profile-summary').innerHTML = E.summaryLines(prof).map(l => '<div class="sline">' + l + '</div>').join('');
  }

  /* ---------- 목록 ---------- */
  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'favorites', label: '⭐ Favorites' },
    { key: 'loved', label: '❤️ Loved' },
    { key: 'liked', label: '👍 Liked' },
    { key: 'okay', label: '😐 Okay' },
    { key: 'didntlike', label: '👎 Didn\u2019t like' },
    { key: 'hated', label: '💀 Hated' }
  ];
  function renderFilters() {
    $('#filters').innerHTML = FILTERS.map(f =>
      '<button class="fbtn' + (state.filter === f.key ? ' is-active' : '') + '" data-filter="' + f.key + '">' + f.label + '</button>'
    ).join('');
  }
  function renderList() {
    const prof = PROF;
    const q = state.query.trim().toLowerCase();
    let films = prof.pool.watched.concat(prof.pool.unseen.map(c => {
      const sc = E.scoreCandidate(c, prof); return Object.assign({}, c, { _fit: sc.fit });
    }));
    if (state.filter === 'favorites') films = films.filter(f => f.category === 'favorite' || S.isFavorite(f.id));
    else if (state.filter !== 'all') films = films.filter(f => bucketOf(f) === state.filter);
    if (q) films = films.filter(f =>
      (f.title + ' ' + f.ko + ' ' + f.director + ' ' + (f.genres || []).join(' ')).toLowerCase().indexOf(q) >= 0
    );
    films.sort((a, b) => (a.status === b.status)
      ? (String(a.title).localeCompare(String(b.title)))
      : (a.status === 'watched' ? -1 : 1));

    $('#list-count-note').textContent = films.length + '편 표시 중 · 카드를 누르면 상세와 평가 화면이 열립니다.';
    $('#cards').innerHTML = films.length
      ? films.map(f => cardHTML(f, f.status === 'candidate' ? f._fit : null)).join('')
      : '<div class="empty">조건에 맞는 영화가 없습니다.</div>';
  }

  /* ---------- 평가 기록 ---------- */
  function renderRatings() {
    const ratings = S.all();
    const ids = Object.keys(ratings);
    // 반응 요약
    const counts = { loved: 0, liked: 0, okay: 0, didntlike: 0, hated: 0 };
    ids.forEach(id => { if (ratings[id].reaction) counts[ratings[id].reaction]++; });
    const total = ids.length || 1;
    $('#rating-bars').innerHTML = E.REACTION_ORDER.map(k =>
      barHTML(E.REACTION[k].label, counts[k] / total, counts[k] + '편')
    ).join('');

    // 요소별 평균
    const agg = {}, cnt = {};
    ids.forEach(id => {
      const d = ratings[id].dims || {};
      Object.keys(d).forEach(k => { if (d[k]) { agg[k] = (agg[k] || 0) + d[k]; cnt[k] = (cnt[k] || 0) + 1; } });
    });
    $('#dim-bars').innerHTML = E.DIMENSIONS.map(d => {
      const v = cnt[d.key] ? agg[d.key] / cnt[d.key] : 0;
      return barHTML(d.label, v / 5, cnt[d.key] ? '평균 ' + E.round(v, 1) + '/5 · ' + cnt[d.key] + '건' : '기록 없음');
    }).join('');

    // 목록
    const byId = {}; M.LIBRARY.concat(M.CANDIDATES).forEach(f => byId[f.id] = f);
    const list = ids.map(id => ({ f: byId[id], r: ratings[id] })).filter(x => x.f);
    $('#ratings-list').innerHTML = list.length ? list.map(x => {
      const dims = Object.keys(x.r.dims || {}).filter(k => x.r.dims[k])
        .map(k => '<span class="tchip">' + esc((E.DIMENSIONS.find(d => d.key === k) || {}).label || k) + ' ' + x.r.dims[k] + '/5</span>').join('');
      return (
        '<div class="rec" data-id="' + esc(x.f.id) + '" role="button" tabindex="0">' +
          '<div class="poster">' + posterHTML(x.f) + '</div>' +
          '<div><p class="rec-t">' + esc(x.f.title) + '</p>' +
            '<p class="rec-s">' + esc(x.r.reaction ? E.REACTION[x.r.reaction].label : '반응 미선택') + ' · ' + String(x.r.at).slice(0, 10) + '</p>' +
            '<div class="tags-line">' + dims + '</div></div>' +
          '<div class="rec-right"><div class="fit-lbl">' + (S.isFavorite(x.f.id) ? '⭐ FAVORITE' : '') + '</div></div>' +
        '</div>'
      );
    }).join('') : '<div class="empty">아직 저장된 평가가 없습니다. 추천 카드나 영화 상세에서 평가를 남겨 보세요.</div>';
  }

  /* ---------- 상세 모달 ---------- */
  function ringHTML(fit) {
    const r = 30, c = 2 * Math.PI * r, off = c * (1 - fit / 100);
    return '<div class="fit-ring"><svg width="78" height="78" viewBox="0 0 78 78">' +
      '<circle cx="39" cy="39" r="' + r + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="7"/>' +
      '<circle cx="39" cy="39" r="' + r + '" fill="none" stroke="#e9c47c" stroke-width="7" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>' +
      '<span class="val">' + fit + '%</span></div>';
  }
  function openDetail(id, fit) {
    const prof = PROF;
    const film = prof.pool.watched.concat(prof.pool.unseen).filter(f => f.id === id)[0];
    if (!film) return;
    const isCandidate = film.status === 'candidate';
    const sc = isCandidate ? E.scoreCandidate(film, prof) : null;
    const ex = sc ? E.explain(sc, prof) : null;
    const rating = S.get(id) || { reaction: null, dims: {} };
    state.draft = { id: id, reaction: rating.reaction, dims: Object.assign({}, rating.dims || {}) };

    const likeList = sc
      ? sc.strengths.slice(0, 4).map(s => '<li><b>' + esc(E.axisLabel(s.key)) + '</b> — ' + esc(E.axisKo(s.key)) + ' (내 선호 ' + Math.round(s.pref * 100) + '% / 이 영화 ' + Math.round(s.t * 100) + '%)</li>').join('')
      : (film.moods || []).map(m => '<li><b>' + esc(m) + '</b></li>').join('');
    const disList = sc
      ? (sc.avoidRisks.slice(0, 3).map(r => '<li>' + esc(E.axisKo(r.key)) + ' — 이 영화 ' + Math.round(r.a * 100) + '%, 내 회피 신호 ' + Math.round(r.pref * 100) + '%</li>').join('') +
         sc.risks.slice(0, 2).map(r => '<li>내 선호가 낮은 요소: <b>' + esc(E.axisLabel(r.key)) + '</b> (내 선호 ' + Math.round(r.pref * 100) + '% / 이 영화 ' + Math.round(r.t * 100) + '%)</li>').join(''))
      : ((film.avoid ? T.AVOID.filter(a => film.avoid[a.key] >= 0.5).map(a => '<li>' + esc(a.ko) + '</li>') : []).join('') || '<li>기록된 회피 신호가 낮습니다.</li>');

    const simLine = ex && ex.similarLiked.length
      ? ex.similarLiked.map(s => esc(s.film.title) + ' ' + Math.round(s.sim * 100) + '%').join(' · ')
      : '';

    const body =
      '<div class="modal-hero">' +
        '<div class="modal-poster">' + posterHTML(film) + '</div>' +
        '<div>' +
          '<p class="modal-kind">' + (isCandidate ? '오늘의 추천 후보' : '내가 본 영화') + '</p>' +
          '<h3 class="modal-title">' + esc(film.title) + '</h3>' +
          '<p class="modal-ko">' + esc(film.ko || '') + '</p>' +
          '<div class="meta-row">' +
            '<span class="mchip">' + esc(film.year) + '</span>' +
            '<span class="mchip">' + esc(film.director) + '</span>' +
            (film.genres || []).map(g => '<span class="mchip">' + esc(g) + '</span>').join('') +
            '<span class="mchip">' + esc(M.CATEGORY_LABEL[film.category] || (isCandidate ? '추천 후보' : '')) + '</span>' +
          '</div>' +
          '<p class="synopsis">' + esc(film.hook || film.note || '') + '</p>' +
          (sc ? '<div class="fit-block">' + ringHTML(sc.fit) +
            '<div class="fit-txt"><b>예상 취향 적합도 ' + sc.fit + '%</b><br>' +
            '취향 축 정렬 ' + Math.round(sc.alignTaste * 100) + ' · 완성도 축 정렬 ' + Math.round(sc.alignCraft * 100) +
            ' · 별로였던 영화와의 태그 유사 ' + Math.round(sc.alignNeg * 100) + ' · 회피 신호 ' + Math.round(sc.avoidMean * 100) +
            (sc.bonus ? ' · 감독/장르 보정 ' + (sc.bonus > 0 ? '+' : '') + E.round(sc.bonus, 1) : '') +
            '</div></div>' + ringHTMLHidden() : '') +
          (ex ? '<h4 class="sec-h">왜 이 영화를 추천했나</h4><p class="why">' + ex.lead + '</p>' +
            '<p class="why"><b>취향 축 연결</b> — ' + esc(ex.axisLine) + '</p>' +
            (simLine ? '<p class="why"><b>가장 닮은 내 영화</b> — ' + simLine + '</p>' : '') +
            '<h4 class="sec-h">주의할 지점</h4><p class="why">' + ex.riskLine + '</p>' : '') +
          (!ex && film.note ? '<h4 class="sec-h">내 기록</h4><p class="why">' + esc(film.note) + '</p>' : '') +
          '<div class="two-col">' +
            '<div class="like-box"><h4>좋아할 가능성이 있는 요소</h4><ul>' + likeList + '</ul></div>' +
            '<div class="dis-box"><h4>싫어할 가능성이 있는 요소</h4><ul>' + disList + '</ul></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<h4 class="sec-h">이 영화 어땠나요?</h4>' +
        '<div class="rate-row" id="rate-row">' + E.REACTION_ORDER.map(k =>
          '<button class="rate-btn' + (state.draft.reaction === k ? ' is-on' : '') + '" data-reaction="' + k + '">' + E.REACTION[k].label + '</button>'
        ).join('') + '</div>' +
        '<h4 class="sec-h">요소별 평가 <span style="color:var(--txt-faint);font-size:11px;letter-spacing:0">(탭할 때마다 0→5, 0은 미선택)</span></h4>' +
        '<div class="dim-row" id="dim-row">' + E.DIMENSIONS.map(d =>
          '<button class="dim-btn' + (state.draft.dims[d.key] ? ' is-on' : '') + '" data-dim="' + d.key + '">' +
          d.label + ' <span class="dv">' + (state.draft.dims[d.key] || 0) + '/5</span></button>'
        ).join('') + '</div>' +
        '<div class="act-row">' +
          '<button class="btn-solid" id="btn-save">평가 저장</button>' +
          '<button class="btn-ghost" id="btn-fav">' + (S.isFavorite(id) ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기 추가') + '</button>' +
          (S.get(id) ? '<button class="btn-ghost" id="btn-clear">평가 삭제</button>' : '') +
          (isCandidate ? '<button class="btn-ghost" id="btn-another">다른 추천 받기</button>' : '') +
        '</div>' +
        '<p class="saved-note" id="saved-note"></p>' +
        '<p class="match-note">적합도는 내가 저장한 영화·평가 데이터로 계산한 추정치이며 영화의 실제 품질 평가가 아닙니다. ' +
        '평가를 저장하면 이 영화는 목록에 추가되고, 그 반응이 다음 추천 점수에 반영됩니다.</p>' +
      '</div>';

    $('#modal-body').innerHTML = body;
    $('#modal').classList.add('is-open');
    $('#modal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  }
  function ringHTMLHidden() { return ''; }

  function closeModal() {
    $('#modal').classList.remove('is-open');
    $('#modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  /* ---------- 추천 실행 ---------- */
  function runRecommend() {
    const res = E.recommend(S.all());
    if (!res) { toast('추천할 후보가 없습니다.'); return; }
    state.lastReco = res;
    S.addHistory({ id: res.rec.film.id, fit: res.rec.fit, at: new Date().toISOString() });
    refresh();
    openDetail(res.rec.film.id, res.rec.fit);
  }

  /* ---------- 뷰 전환 ---------- */
  function show(view) {
    state.view = view;
    $$('.view').forEach(v => v.classList.remove('is-active'));
    const el = $('#view-' + view);
    if (el) el.classList.add('is-active');
    $$('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.nav === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'profile') renderProfile();
    if (view === 'list') { renderFilters(); renderList(); }
    if (view === 'ratings') renderRatings();
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    document.addEventListener('click', function (e) {
      const nav = e.target.closest('[data-nav]');
      if (nav) { show(nav.dataset.nav); return; }
      if (e.target.closest('[data-close]')) { closeModal(); return; }

      const card = e.target.closest('.mcard');
      if (card) { openDetail(card.dataset.id, card.querySelector('.badge.fit') ? parseInt(card.querySelector('.badge.fit').textContent, 10) : null); return; }

      const rec = e.target.closest('.rec');
      if (rec && rec.dataset.id) { openDetail(rec.dataset.id, null); return; }

      const fbtn = e.target.closest('[data-filter]');
      if (fbtn) { state.filter = fbtn.dataset.filter; renderFilters(); renderList(); return; }

      const rbtn = e.target.closest('[data-reaction]');
      if (rbtn) {
        state.draft.reaction = rbtn.dataset.reaction;
        $$('#rate-row .rate-btn').forEach(b => b.classList.toggle('is-on', b.dataset.reaction === state.draft.reaction));
        return;
      }
      const dbtn = e.target.closest('[data-dim]');
      if (dbtn) {
        const k = dbtn.dataset.dim;
        const cur = state.draft.dims[k] || 0;
        const next = (cur + 1) % 6;
        if (next === 0) delete state.draft.dims[k]; else state.draft.dims[k] = next;
        dbtn.classList.toggle('is-on', !!next);
        dbtn.querySelector('.dv').textContent = next + '/5';
        return;
      }
      if (e.target.closest('#btn-save')) {
        if (!state.draft.reaction) { toast('먼저 반응을 선택해 주세요.'); return; }
        S.setRating(state.draft.id, state.draft.reaction, state.draft.dims);
        toast('저장했습니다. 다음 추천에 반영됩니다.');
        refresh();
        const n = $('#saved-note'); if (n) n.textContent = '저장 완료 · ' + E.REACTION[state.draft.reaction].label;
        return;
      }
      if (e.target.closest('#btn-fav')) {
        const now = S.toggleFavorite(state.draft.id);
        e.target.closest('#btn-fav').textContent = now ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기 추가';
        toast(now ? '즐겨찾기에 추가했습니다.' : '즐겨찾기에서 뺐습니다.');
        refresh();
        return;
      }
      if (e.target.closest('#btn-clear')) {
        S.clearRating(state.draft.id);
        toast('평가를 삭제했습니다.');
        closeModal(); refresh(); return;
      }
      if (e.target.closest('#btn-another')) {
        closeModal(); runRecommend(); return;
      }
    });

    $('#btn-tonight').addEventListener('click', runRecommend);

    $('#search').addEventListener('input', function (e) { state.query = e.target.value; renderList(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#modal').classList.contains('is-open')) closeModal();
      if (e.key === 'Enter' && e.target.classList.contains('rec')) openDetail(e.target.dataset.id, null);
    });

    $('#btn-export').addEventListener('click', function () {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sangmins-cinema-ratings.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('평가 데이터를 JSON으로 내보냈습니다.');
    });
    $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
    $('#import-file').addEventListener('change', function (e) {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = function () {
        try { S.importJSON(String(fr.result)); toast('불러왔습니다.'); refresh(); renderRatings(); }
        catch (err) { toast('JSON을 읽지 못했습니다.'); }
      };
      fr.readAsText(f);
    });
    $('#btn-reset').addEventListener('click', function () {
      if (confirm('저장된 평가·추천 이력을 모두 삭제할까요?')) { S.reset(); toast('초기화했습니다.'); refresh(); show('ratings'); }
    });
  }

  /* ---------- 새로고침 ---------- */
  function refresh() {
    PROF = E.buildProfile(S.all());
    renderHome();
    if (state.view === 'profile') renderProfile();
    if (state.view === 'list') renderList();
    if (state.view === 'ratings') renderRatings();
  }

  function init() {
    PROF = E.buildProfile(S.all());
    bind();
    renderHome();
    renderFilters();
    console.log('[Sangmin\'s Cinema] ready · watched=' + PROF.counts.watched + ' candidates=' + PROF.counts.candidates);
  }

  return { init, show, refresh, runRecommend, openDetail,
    get profile() { return PROF; } };
})();
