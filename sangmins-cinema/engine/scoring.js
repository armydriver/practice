/* ===========================================================
   engine/scoring.js  —  취향 기반 weighted scoring system
   -----------------------------------------------------------
   * 하드코딩된 ML 없이 태그 벡터(12 취향축 / 6 회피축) 기반으로
     사용자 취향 프로필을 만들고 후보 영화를 채점합니다.
   * 가중치 체계
       ❤️ favorite  +1.35
       ❤️ loved     +1.00
       🏆 craft     +0.30  (연출·완성도 축에만 반영)
       🤔 craftLow  -0.45
       👎 disliked  -1.00
       (사용자가 남긴 평가는 감정 가중치 loved+1.2 / liked+0.8 /
        okay-0.1 / didn't like-0.7 / hated-1.2 로 대체됩니다)
   =========================================================== */
window.CinemaEngine = (function () {
  const M = window.MOVIES, T = window.TAXONOMY;
  const TASTE_KEYS = T.TASTE_KEYS, AVOID_KEYS = T.AVOID_KEYS;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sum = a => a.reduce((s, v) => s + v, 0);
  const round = (v, d) => { const p = Math.pow(10, d || 0); return Math.round(v * p) / p; };

  const REACTION = {
    loved:     { w: 1.2,  label: '❤️ Loved it',       ko: '최고였어' },
    liked:     { w: 0.8,  label: '👍 Liked it',       ko: '좋았어' },
    okay:      { w: -0.1, label: '😐 It was okay',    ko: '그저 그랬어' },
    didntlike: { w: -0.7, label: '👎 Didn\u2019t like it', ko: '별로였어' },
    hated:     { w: -1.2, label: '💀 Hated it',       ko: '최악이었어' }
  };
  const REACTION_ORDER = ['loved', 'liked', 'okay', 'didntlike', 'hated'];

  const DIMENSIONS = [
    { key: 'story',       label: 'Story' },
    { key: 'characters',  label: 'Characters' },
    { key: 'world',       label: 'World-building' },
    { key: 'visuals',     label: 'Visuals' },
    { key: 'music',       label: 'Music' },
    { key: 'emotion',     label: 'Emotional impact' },
    { key: 'pacing',      label: 'Pacing' },
    { key: 'originality', label: 'Originality' }
  ];
  const DIM_AXES = {
    story: ['pacing', 'philosophy'],
    characters: ['character', 'emotion'],
    world: ['world', 'fantasy'],
    visuals: ['spectacle'],
    music: ['music'],
    emotion: ['emotion'],
    pacing: ['pacing'],
    originality: ['world', 'scifi', 'mystery']
  };

  /* ---------- 캘리브레이션 상수 ---------- */
  const CAL = {
    base: 30,
    wTaste: 62,
    wCraft: 15,
    wNeg: 26,
    wAvoid: 34,
    bDirector: 3.4,
    bGenre: 1.6,
    bMood: 2.0,
    pDirector: 2.6
  };

  /* ---------- 벡터 유틸 ---------- */
  // 후보의 "강한 영역"에서 사용자 선호값의 가중 평균  (0~1)
  function weightedMean(pref, vec) {
    const denom = sum(TASTE_KEYS.map(k => vec[k] || 0));
    if (denom <= 0) return 0;
    return sum(TASTE_KEYS.map(k => pref[k] * (vec[k] || 0))) / denom;
  }
  function weightedMeanAvoid(pref, vec) {
    const denom = sum(AVOID_KEYS.map(k => vec[k] || 0));
    if (denom <= 0) return 0;
    return sum(AVOID_KEYS.map(k => pref[k] * (vec[k] || 0))) / denom;
  }
  function cosine(a, b, keys) {
    let dot = 0, na = 0, nb = 0;
    keys.forEach(k => { dot += (a[k] || 0) * (b[k] || 0); na += (a[k] || 0) ** 2; nb += (b[k] || 0) ** 2; });
    if (!na || !nb) return 0;
    return dot / Math.sqrt(na * nb);
  }

  /* ---------- 전체 영화 풀(평가 반영) ---------- */
  function buildPool(ratings) {
    ratings = ratings || {};
    const rated = [];
    M.LIBRARY.forEach(f => { f.status = 'watched'; });
    M.CANDIDATES.forEach(c => {
      const r = ratings[c.id];
      if (r && r.reaction) {
        rated.push(Object.assign({}, c, {
          status: 'watched',
          category: 'user_' + r.reaction,
          baseCategory: 'candidate',
          userReaction: r.reaction,
          dims: r.dims || {},
          weight: REACTION[r.reaction].w,
          ratedAt: r.at || ''
        }));
      }
    });
    const watched = M.LIBRARY.concat(rated);
    const unseen = M.CANDIDATES.filter(c => !(ratings[c.id] && ratings[c.id].reaction));
    return { watched, rated, unseen };
  }

  /* ---------- 취향 프로필 ---------- */
  function buildProfile(ratings) {
    const pool = buildPool(ratings);
    const watched = pool.watched;
    const pos = watched.filter(f => f.weight > 0);
    const neg = watched.filter(f => f.weight < 0);
    const craft = watched.filter(f => f.category === 'craft');

    const wPos = sum(pos.map(f => f.weight)) || 1;
    const wNeg = sum(neg.map(f => Math.abs(f.weight))) || 1;

    const taste = {}, negTaste = {}, craftTaste = {}, avoidPref = {};
    TASTE_KEYS.forEach(k => {
      taste[k] = sum(pos.map(f => f.weight * f.tags[k])) / wPos;
      negTaste[k] = sum(neg.map(f => Math.abs(f.weight) * f.tags[k])) / wNeg;
      craftTaste[k] = craft.length ? sum(craft.map(f => f.tags[k])) / craft.length : taste[k];
    });
    AVOID_KEYS.forEach(k => { avoidPref[k] = sum(neg.map(f => Math.abs(f.weight) * f.avoid[k])) / wNeg; });

    // 취향 "신호 강도" — 좋아하는 영화에서 높고 별로였던 영화에서 낮을수록 강한 신호.
    // 50% = 좋아한 영화와 싫어한 영화에서 비슷한 수준(이 축만으로는 구분력이 낮음)
    const signal = {};
    TASTE_KEYS.forEach(k => { signal[k] = clamp(0.5 + (taste[k] - negTaste[k]) * 0.5, 0, 1); });

    // 사용자 평가의 요소별 점수를 취향 벡터에 소폭 반영
    const adjust = {}; TASTE_KEYS.forEach(k => adjust[k] = 0);
    let dimRatings = 0;
    Object.keys(ratings || {}).forEach(id => {
      const r = ratings[id];
      if (!r || !r.dims) return;
      const w = REACTION[r.reaction] ? REACTION[r.reaction].w : 0.5;
      const sign = w >= 0 ? 1 : -1;
      Object.keys(r.dims).forEach(dim => {
        const score = r.dims[dim];
        if (!score) return;
        dimRatings++;
        const s = (score - 3) / 2;                       // -1 ~ +1
        (DIM_AXES[dim] || []).forEach(k => {
          adjust[k] += 0.05 * s * sign * Math.min(1, Math.abs(w));
        });
      });
    });
    TASTE_KEYS.forEach(k => { adjust[k] = clamp(adjust[k], -0.12, 0.12); });

    const tasteAdj = {};
    TASTE_KEYS.forEach(k => { tasteAdj[k] = clamp(taste[k] + adjust[k], 0, 1); });

    // 대표 감정/분위기 태그
    const moodCount = {};
    pos.forEach(f => { const mw = f.weight; (f.moods || []).forEach(m => { moodCount[m] = (moodCount[m] || 0) + mw; }); });
    const moods = Object.keys(moodCount).sort((a, b) => moodCount[b] - moodCount[a]).slice(0, 8);

    // 감독·장르 신호
    const dirPos = {}, dirNeg = {}, genPos = {}, genNeg = {};
    pos.forEach(f => {
      if (f.director && f.director !== '확인 필요') f.director.split('·').forEach(d => {
        d = d.trim(); if (d) dirPos[d] = (dirPos[d] || 0) + f.weight;
      });
      (f.genres || []).forEach(g => genPos[g] = (genPos[g] || 0) + f.weight);
    });
    neg.forEach(f => {
      if (f.director && f.director !== '확인 필요') f.director.split('·').forEach(d => {
        d = d.trim(); if (d) dirNeg[d] = (dirNeg[d] || 0) + Math.abs(f.weight);
      });
      (f.genres || []).forEach(g => genNeg[g] = (genNeg[g] || 0) + Math.abs(f.weight));
    });

    return {
      pool, taste, tasteAdj, negTaste, craftTaste, avoidPref, adjust, signal,
      moods, moodCount, dirPos, dirNeg, genPos, genNeg, dimRatings,
      counts: {
        watched: watched.length,
        loved: watched.filter(f => f.weight > 0 && f.category !== 'craft').length,
        craft: craft.length,
        disliked: neg.length,
        candidates: pool.unseen.length,
        rated: Object.keys(ratings || {}).length
      }
    };
  }

  /* ---------- 후보 채점 ---------- */
  function scoreCandidate(cand, prof) {
    const t = cand.tags, a = cand.avoid;
    const alignTaste = weightedMean(prof.tasteAdj, t);
    const alignCraft = weightedMean(prof.craftTaste, t);
    const alignNeg = weightedMean(prof.negTaste, t);
    const avoidMean = weightedMeanAvoid(prof.avoidPref, a);

    // 감독·장르 보너스/페널티
    let bonus = 0, signals = [];
    if (cand.director && cand.director !== '확인 필요') {
      cand.director.split('·').forEach(d => {
        d = d.trim();
        if (prof.dirPos[d] >= 1.0) { bonus += CAL.bDirector; signals.push(d + ' 감독의 작품을 이미 좋아함'); }
        else if (prof.dirNeg[d] >= 1.0) { bonus -= CAL.pDirector; signals.push(d + ' 감독의 이전 작품이 맞지 않았음'); }
      });
    }
    (cand.genres || []).forEach(g => {
      if ((prof.genPos[g] || 0) >= 3) bonus += CAL.bGenre;
      if ((prof.genNeg[g] || 0) >= 3) bonus -= CAL.bGenre * 0.8;
    });
    (cand.moods || []).forEach(m => { if (prof.moodCount[m] >= 1.5) bonus += CAL.bMood * 0.5; });

    const raw = CAL.base
      + CAL.wTaste * alignTaste
      + CAL.wCraft * alignCraft
      - CAL.wNeg * alignNeg
      - CAL.wAvoid * avoidMean
      + bonus;

    const fit = clamp(Math.round(raw), 12, 97);

    // ---- 요소 분해 (설명·리스트용) ----
    const strengths = TASTE_KEYS
      .map(k => ({ key: k, t: t[k], pref: prof.tasteAdj[k], score: t[k] * prof.tasteAdj[k] }))
      .filter(x => x.t >= 0.45)
      .sort((x, y) => y.score - x.score);

    const risks = TASTE_KEYS
      .map(k => ({ key: k, t: t[k], pref: prof.tasteAdj[k], gap: t[k] * (1 - prof.tasteAdj[k]) }))
      .filter(x => x.t >= 0.45 && x.pref < 0.62)
      .sort((x, y) => y.gap - x.gap);

    const avoidRisks = AVOID_KEYS
      .map(k => ({ key: k, a: a[k], pref: prof.avoidPref[k], w: a[k] * prof.avoidPref[k] }))
      .filter(x => x.a >= 0.3)
      .sort((x, y) => y.w - x.w);

    return {
      film: cand, fit: fit, raw: raw,
      alignTaste, alignCraft, alignNeg, avoidMean, bonus,
      strengths, risks, avoidRisks, signals
    };
  }

  function similarityTo(film, refTags) {
    const keys = TASTE_KEYS;
    const a = {}, b = {};
    keys.forEach(k => { a[k] = refTags[k]; b[k] = film.tags[k]; });
    return clamp(cosine(a, b, keys), 0, 1);
  }

  /* ---------- 설명 생성 ---------- */
  function axisPhrase(key) {
    const ax = T.TASTE.find(a => a.key === key) || T.AVOID.find(a => a.key === key);
    return ax ? ax.phrase : key;
  }
  function axisLabel(key) {
    const ax = T.TASTE.find(a => a.key === key) || T.AVOID.find(a => a.key === key);
    return ax ? ax.label : key;
  }
  function axisKo(key) {
    const ax = T.TASTE.find(a => a.key === key) || T.AVOID.find(a => a.key === key);
    return ax ? ax.ko : key;
  }

  // 후보와 가장 닮은 좋아한 영화 top3 + 그 영화에서 어떤 요소가 겹치는지
  function explain(rec, prof) {
    const cand = rec.film;
    const liked = prof.pool.watched.filter(f => f.weight > 0 && f.id !== cand.id);
    const scored = liked.map(f => {
      const sim = similarityTo(cand, f.tags);
      const shared = TASTE_KEYS
        .map(k => ({ k: k, w: Math.min(cand.tags[k], f.tags[k]) * f.tags[k] * prof.tasteAdj[k] }))
        .sort((x, y) => y.w - x.w)[0];
      return { film: f, sim: sim, key: shared ? shared.k : 'world' };
    }).sort((a, b) => b.sim - a.sim);

    const top = scored.slice(0, 3);
    const dislikedNear = prof.pool.watched
      .filter(f => f.weight < 0)
      .map(f => ({ film: f, sim: similarityTo(cand, f.tags) }))
      .sort((a, b) => b.sim - a.sim).slice(0, 2);

    // 1) 핵심 연결 문장
    const clauses = top.map(x => `<em>${x.film.title}</em>에서 ${axisPhrase(x.key)}에 끌렸다면`);
    const lead = clauses.length
      ? `${clauses.join(', ')} — 이 영화도 잘 맞을 가능성이 있습니다.`
      : '아직 비교할 만큼 데이터가 쌓이지 않았습니다.';

    // 2) 취향 축 연결
    const axisLine = rec.strengths.slice(0, 3).map(s =>
      `${axisLabel(s.key)}(내 선호 ${Math.round(s.pref * 100)}% / 이 영화 ${Math.round(s.t * 100)}%)`
    ).join(' · ');

    // 3) 리스크 문장
    const riskParts = [];
    if (rec.avoidRisks.length) {
      riskParts.push(rec.avoidRisks.slice(0, 2).map(r => axisKo(r.key)).join(', '));
    }
    if (rec.risks.length) riskParts.push('내 선호가 낮은 요소: ' + rec.risks.slice(0, 2).map(r => axisLabel(r.key)).join(', '));
    if (dislikedNear.length && dislikedNear[0].sim > 0.9) {
      riskParts.push(`<mark>${dislikedNear[0].film.title}</mark>과 태그 유사도가 높습니다(${Math.round(dislikedNear[0].sim * 100)}%)`);
    }
    if (rec.signals.length) riskParts.push(rec.signals.join(' / '));

    return {
      lead: lead,
      axisLine: axisLine,
      riskLine: riskParts.length ? riskParts.join(' · ') : '현재 데이터 기준으로 뚜렷한 회피 신호는 발견되지 않았습니다.',
      similarLiked: top,
      similarDisliked: dislikedNear
    };
  }

  /* ---------- 추천 ---------- */
  function rankCandidates(ratings, opts) {
    opts = opts || {};
    const prof = buildProfile(ratings);
    let pool = prof.pool.unseen;
    if (opts.genres && opts.genres.length) pool = pool.filter(c => c.genres.some(g => opts.genres.indexOf(g) >= 0));
    const scored = pool.map(c => scoreCandidate(c, prof)).sort((a, b) => b.fit - a.fit);
    return { profile: prof, ranked: scored };
  }

  function recommend(ratings, opts) {
    opts = opts || {};
    const { profile, ranked } = rankCandidates(ratings, opts);
    if (!ranked.length) return null;
    const topN = opts.explore ? ranked.slice(0, 6) : ranked.slice(0, 3);
    // 최상위권 중 가중 랜덤 선택 (매번 같은 영화만 나오지 않도록)
    const weights = topN.map((r, i) => Math.pow(0.55, i));
    const total = sum(weights);
    let pick = Math.random() * total, chosen = topN[0];
    for (let i = 0; i < topN.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = topN[i]; break; } }
    const explainer = explain(chosen, profile);
    return {
      rec: chosen,
      explainer: explainer,
      ranked: ranked,
      alternatives: ranked.filter(r => r.film.id !== chosen.film.id).slice(0, 4),
      profile: profile
    };
  }

  /* ---------- 프로필 요약 문장 ---------- */
  function summaryLines(prof) {
    const t = prof.tasteAdj, s = prof.signal, n = prof.negTaste;
    const bySignal = TASTE_KEYS.slice().sort((a, b) => s[b] - s[a]);
    const top = bySignal.slice(0, 4);
    const flat = bySignal.slice(-2);
    const byLevel = TASTE_KEYS.slice().sort((a, b) => t[b] - t[a]);
    const av = AVOID_KEYS.slice().sort((a, b) => prof.avoidPref[b] - prof.avoidPref[a]).slice(0, 3);
    const lines = [];
    lines.push(`좋아하는 영화와 별로였던 영화를 가장 잘 갈라내는 축(취향 신호)은 <b>${top.map(k => axisKo(k)).join(' · ')}</b> 입니다. 후보 영화의 이 축이 강할수록 추천 점수가 올라갑니다.`);
    lines.push(`좋아하는 영화에서 가장 높게 나타난 축은 <b>${byLevel.slice(0, 3).map(k => axisLabel(k) + ' ' + Math.round(t[k] * 100) + '%').join(' · ')}</b> 이고, 별로였던 영화에서도 높아 구분력이 낮은 축은 <b>${flat.map(k => axisLabel(k)).join(' · ')}</b> 입니다. 후자는 '기본 조건'에 가깝습니다.`);
    lines.push(`Fantasy ${Math.round(t.fantasy * 100)}% / Sci-Fi ${Math.round(t.scifi * 100)}% (좋아하는 영화 평균) vs Fantasy ${Math.round(n.fantasy * 100)}% / Sci-Fi ${Math.round(n.scifi * 100)}% (별로였던 영화 평균) — 판타지·SF는 좋아하는 영화 쪽에서만 뚜렷하게 높습니다.`);
    lines.push(`별로였던 영화에서 반복적으로 나타난 신호는 <b>${av.map(k => axisKo(k)).join(' · ')}</b> 이며, 후보 영화가 이 신호를 많이 가질수록 감점됩니다.`);
    if (prof.moods.length) lines.push(`좋아하는 영화에서 자주 겹치는 정서 키워드는 <b>${prof.moods.slice(0, 5).join(' · ')}</b> 입니다.`);
    const dirs = Object.keys(prof.dirPos).sort((a, b) => prof.dirPos[b] - prof.dirPos[a]).slice(0, 4);
    if (dirs.length) lines.push(`반복적으로 좋아한 감독(또는 연출 조합)은 <b>${dirs.join(' · ')}</b> 입니다.`);
    if (prof.dimRatings) lines.push(`저장된 요소별 평가 <b>${prof.dimRatings}건</b>이 취향 벡터에 소폭 반영되었습니다(축당 최대 ±0.12).`);
    return lines;
  }

  return {
    CAL, REACTION, REACTION_ORDER, DIMENSIONS, DIM_AXES,
    buildPool, buildProfile, scoreCandidate, rankCandidates, recommend,
    explain, similarityTo, summaryLines, axisLabel, axisKo, axisPhrase,
    clamp, round, TASTE_KEYS, AVOID_KEYS
  };
})();
