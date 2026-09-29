/* ===========================================================
   data/taxonomy.js
   취향 분석 축(axis) 정의 — 순서가 movies.js 의 T/A 배열 순서와 1:1 대응합니다.
   나중에 축을 추가/삭제할 때는 이 파일의 배열만 수정하면 됩니다.
   =========================================================== */
window.TAXONOMY = (function () {
  // 취향(선호) 축 12개 — 영화가 "이런 요소를 얼마나 가지고 있는가"
  const TASTE = [
    { key: 'fantasy',     label: 'Fantasy',            ko: '판타지',              phrase: '현실의 규칙을 벗어난 판타지 세계' },
    { key: 'scifi',       label: 'Sci-Fi',             ko: 'SF',                  phrase: '과학적 상상력으로 세운 낯선 세계' },
    { key: 'adventure',   label: 'Adventure',          ko: '모험',                phrase: '목표를 향해 밀고 나가는 모험의 추진력' },
    { key: 'world',       label: 'World-building',     ko: '세계관',              phrase: '새로운 세계를 탐험하는 느낌' },
    { key: 'spectacle',   label: 'Visual spectacle',   ko: '시각적 볼거리',       phrase: '화면이 압도하는 시각적 볼거리' },
    { key: 'emotion',     label: 'Emotional impact',   ko: '감정적 여운',         phrase: '보고 나서 오래 남는 감정의 여운' },
    { key: 'music',       label: 'Music',              ko: '음악·사운드',         phrase: '음악과 사운드가 장면을 끌어올리는 힘' },
    { key: 'mystery',     label: 'Mystery',            ko: '미스터리',            phrase: '비밀이 풀려가는 과정의 쾌감' },
    { key: 'ambition',    label: 'Ambition',           ko: '야망·집착',           phrase: '인간의 야망과 집착을 밀어붙이는 서사' },
    { key: 'character',   label: 'Character-driven',   ko: '캐릭터 중심',         phrase: '캐릭터의 목표가 분명한 이야기' },
    { key: 'philosophy',  label: 'Philosophical',      ko: '철학적 주제',         phrase: '이야기 뒤에 남는 철학적인 질문' },
    { key: 'pacing',      label: 'Pacing',             ko: '서사 진행',           phrase: '이야기가 명확하게 진행되는 구조' }
  ];

  // 회피 축 6개 — 높을수록 추천 점수가 깎입니다.
  const AVOID = [
    { key: 'slow',      label: 'Too slow',            ko: '지나치게 느린 전개',            phrase: '지나치게 느린 전개' },
    { key: 'abstract',  label: 'Overly abstract',     ko: '추상적·난해한 서사',            phrase: '지나치게 추상적이고 난해한 서사' },
    { key: 'vibeOnly',  label: 'Mood over story',     ko: '분위기만 강조',                 phrase: '이야기보다 분위기만 강조하는 연출' },
    { key: 'message',   label: 'Message overload',    ko: '메시지가 작품을 압도',          phrase: '정치·사회 메시지가 작품 전체를 압도하는 구성' },
    { key: 'shock',     label: 'Shock for shock',     ko: '자극·충격 목적',                phrase: '단순한 자극이나 충격을 목적으로 하는 장면' },
    { key: 'vagueLore', label: 'Unexplained lore',    ko: '설정 설명 부족',                phrase: '세계관 설명이 부족해 관객이 과도하게 추측해야 하는 구조' }
  ];

  // 감정·분위기 태그(설명 생성 및 유사도 보조 신호)
  const MOODS = [
    '몰입형 세계', '시각적 쾌감', '따뜻한 여운', '묵직한 여운', '성장 서사', '천재의 집착',
    '시간과 기억', '가족과 상실', '대서사', '어두운 영웅', '동화적', '실존적 질문',
    '엔진처럼 굴러가는 서사', '고요한 관조', '디스토피아', '실화 기반'
  ];

  const TASTE_KEYS = TASTE.map(a => a.key);
  const AVOID_KEYS = AVOID.map(a => a.key);

  // 배열 -> 객체 변환 (movies.js 의 압축 표기를 사람이 읽는 구조로)
  function toTaste(arr) {
    const o = {}; TASTE_KEYS.forEach((k, i) => { o[k] = +(arr[i] || 0); }); return o;
  }
  function toAvoid(arr) {
    const o = {}; AVOID_KEYS.forEach((k, i) => { o[k] = +(arr[i] || 0); }); return o;
  }

  return { TASTE, AVOID, MOODS, TASTE_KEYS, AVOID_KEYS, toTaste, toAvoid };
})();
