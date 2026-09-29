/* 자동 검증 스크립트 — jsdom 으로 실제 앱을 로드해 런타임 오류와 핵심 동작을 확인합니다. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = '/home/user/sangmins-cinema';
const problems = [];
const info = [];

/* ---------- 1) 데이터 무결성(파일을 직접 파싱) ---------- */
const SHARED = {};
function loadModule(p) {
  const code = fs.readFileSync(p, 'utf8');
  const fn = new Function('window', code);
  fn(SHARED); // data/movies.js 가 window.TAXONOMY 를 참조하므로 공유 컨텍스트 사용
  return SHARED;
}
loadModule(path.join(ROOT, 'data/taxonomy.js'));
loadModule(path.join(ROOT, 'data/movies.js'));
const tax = SHARED.TAXONOMY;
const mv = SHARED.MOVIES;

info.push('TASTE axes=' + tax.TASTE.length + ' AVOID axes=' + tax.AVOID.length);
info.push('LIBRARY=' + mv.LIBRARY.length + ' CANDIDATES=' + mv.CANDIDATES.length);

mv.LIBRARY.concat(mv.CANDIDATES).forEach(f => {
  tax.TASTE_KEYS.forEach(k => {
    const v = f.tags[k];
    if (typeof v !== 'number' || v < 0 || v > 1) problems.push('bad taste tag ' + f.title + ' ' + k + '=' + v);
  });
  tax.AVOID_KEYS.forEach(k => {
    const v = f.avoid[k];
    if (typeof v !== 'number' || v < 0 || v > 1) problems.push('bad avoid tag ' + f.title + ' ' + k + '=' + v);
  });
  if (!f.title || !f.year || !f.director) problems.push('missing meta: ' + f.title);
  if (!f.genres || !f.genres.length) problems.push('missing genres: ' + f.title);
});
// 중복 id 검사
const ids = mv.LIBRARY.concat(mv.CANDIDATES).map(f => f.id);
new Set(ids).forEach(v => {});
if (new Set(ids).size !== ids.length) problems.push('duplicate film ids: ' + ids.length + ' vs ' + new Set(ids).size);

/* 요청된 9편의 부정 목록 / 7편의 craft 목록이 모두 들어갔는지 */
const mustDislike = ['7광구', '톡 투 미', '파일럿', '더 마블스', '인어공주 (실사)', '플랫폼', '리얼', '해운대', '백두산'];
mustDislike.forEach(ko => {
  const hit = mv.LIBRARY.find(f => f.ko === ko);
  if (!hit) problems.push('missing disliked film: ' + ko);
  else if (hit.category !== 'disliked') problems.push('wrong category ' + ko + ' -> ' + hit.category);
});
const mustCraft = ['바빌론', '그랜드 부다페스트 호텔', '바스터즈: 거친 녀석들', '장고: 분노의 추적자',
  '소셜 네트워크', '화양연화', '옵세션 (감독·연도 확인 필요)'];
mustCraft.forEach(ko => {
  const hit = mv.LIBRARY.find(f => f.ko === ko);
  if (!hit) problems.push('missing craft film: ' + ko);
  else if (hit.category !== 'craft') problems.push('wrong category ' + ko + ' -> ' + hit.category);
});

/* ---------- 2) jsdom 런타임 검증 ---------- */
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<script[\s\S]*?<\/script>/g, ''); // 스크립트는 수동 주입

const consoleErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => consoleErrors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => consoleErrors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => { /* 경고는 무시 */ });

const dom = new JSDOM(html, { url: 'http://localhost:8000/', runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
const w = dom.window;
w.addEventListener('error', e => consoleErrors.push('window error: ' + (e.error && e.error.message || e.message)));

const files = ['data/taxonomy.js', 'data/movies.js', 'data/ratings.js', 'engine/scoring.js', 'app/store.js', 'app/ui.js'];
try {
  files.forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  w.eval('window.CinemaUI.init();');
} catch (e) {
  problems.push('FATAL during init: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n'));
}

const d = w.document;
const prof = w.CinemaEngine ? w.CinemaEngine.buildProfile({}) : null;
if (prof) {
  info.push('profile counts = ' + JSON.stringify(prof.counts));
  const topAxes = tax.TASTE.map(a => ({ a: a.label, v: prof.tasteAdj[a.key] })).sort((x, y) => y.v - x.v).slice(0, 5)
    .map(x => x.a + ' ' + Math.round(x.v * 100) + '%');
  info.push('top taste axes = ' + topAxes.join(' | '));
  const topAvoid = tax.AVOID.map(a => ({ a: a.ko, v: prof.avoidPref[a.key] })).sort((x, y) => y.v - x.v).slice(0, 3)
    .map(x => x.a + ' ' + Math.round(x.v * 100) + '%');
  info.push('top avoid axes = ' + topAvoid.join(' | '));
  if (!(prof.counts.watched === mv.LIBRARY.length)) problems.push('watched count mismatch');
}

// 홈 렌더 확인
const dnaCount = d.querySelectorAll('#dna-grid .dna-row').length;
const railCount = d.querySelectorAll('#rail-favorites .mcard').length;
info.push('home rendered: dna rows=' + dnaCount + ', favorite cards=' + railCount);
if (dnaCount !== 6) problems.push('dna rows expected 6, got ' + dnaCount);
if (railCount < 5) problems.push('favorite rail too small: ' + railCount);

// 추천 버튼 클릭 → 모달
d.querySelector('#btn-tonight').click();
const modalOpen = d.querySelector('#modal').classList.contains('is-open');
const mt = d.querySelector('.modal-title') ? d.querySelector('.modal-title').textContent : '';
const mfit = d.querySelector('.fit-ring .val') ? d.querySelector('.fit-ring .val').textContent : '';
const why = d.querySelector('.why') ? d.querySelector('.why').textContent.slice(0, 160) : '';
const likeLis = d.querySelectorAll('.like-box li').length;
const disLis = d.querySelectorAll('.dis-box li').length;
info.push('modal open=' + modalOpen + ' title=' + mt + ' fit=' + mfit);
info.push('why = ' + why.replace(/\s+/g, ' '));
info.push('like bullets=' + likeLis + ' dislike bullets=' + disLis);
if (!modalOpen) problems.push('modal did not open after #btn-tonight');
if (!mt) problems.push('modal title empty');
if (!d.querySelector('.badge.fit')) { /* 카드가 아니라 모달이므로 무시 */ }
if (likeLis < 1) problems.push('like bullets empty');
if (disLis < 1) problems.push('dislike bullets empty');

// 평가 저장
d.querySelector('[data-reaction="loved"]').click();
const dimBtns = d.querySelectorAll('#dim-row .dim-btn');
for (let i = 0; i < 3; i++) dimBtns[i].click();
dimBtns[3].click(); // 1회 = 1점
d.querySelector('#btn-save').click();
const store = w.CinemaStore.raw();
info.push('after save: ratings=' + Object.keys(store.ratings).length + ' history=' + store.history.length);
if (Object.keys(store.ratings).length !== 1) problems.push('rating not saved');
if (store.history.length !== 1) problems.push('history not recorded');
const savedReaction = Object.values(store.ratings)[0].reaction;
if (savedReaction !== 'loved') problems.push('reaction mismatch: ' + savedReaction);

// 즐겨찾기 토글
d.querySelector('#btn-fav').click();
info.push('favorites=' + w.CinemaStore.favorites().length);
if (w.CinemaStore.favorites().length !== 1) problems.push('favorite toggle failed');

// 뷰 전환 렌더
w.CinemaUI.show('profile');
const barCount = d.querySelectorAll('#profile-bars .dna-row').length;
const avoidCount = d.querySelectorAll('#avoid-bars .dna-row').length;
const tableRows = d.querySelectorAll('#tbl-contrib tbody tr').length;
const summaryLines = d.querySelectorAll('#profile-summary .sline').length;
info.push('profile: bars=' + barCount + ' avoidBars=' + avoidCount + ' tableRows=' + tableRows + ' summary=' + summaryLines);
if (barCount !== 12) problems.push('taste bars expected 12 got ' + barCount);
if (avoidCount !== 6) problems.push('avoid bars expected 6 got ' + avoidCount);
const expectedRows = mv.LIBRARY.length + Object.keys(store.ratings).length; // 평가한 후보는 감상 목록으로 편입
if (tableRows !== expectedRows) problems.push('contrib table rows expected ' + expectedRows + ' got ' + tableRows);
if (summaryLines < 3) problems.push('summary lines too few');
const summaryText = d.querySelector('#profile-summary').textContent.replace(/\s+/g, ' ');
info.push('summary = ' + summaryText.slice(0, 220));

w.CinemaUI.show('list');
const cardCount = d.querySelectorAll('#cards .mcard').length;
info.push('list: total cards=' + cardCount);
if (cardCount !== mv.LIBRARY.length + mv.CANDIDATES.length) problems.push('list card count mismatch: ' + cardCount);
// 필터
d.querySelector('[data-filter="hated"]').click();
const hatedCount = d.querySelectorAll('#cards .mcard').length;
info.push('list filter hated cards=' + hatedCount);
if (hatedCount !== 9) problems.push('hated filter expected 9 got ' + hatedCount);
// 검색 (필터를 All 로 되돌린 뒤 검색해야 전체 풀 대상)
d.querySelector('[data-filter="all"]').click();
d.querySelector('#search').value = 'nolan';
d.querySelector('#search').dispatchEvent(new w.Event('input'));
const searchCount = d.querySelectorAll('#cards .mcard').length;
info.push('search "nolan" cards=' + searchCount);
if (searchCount < 3) problems.push('search failed: ' + searchCount);
d.querySelector('#search').value = '인터스텔라';
d.querySelector('#search').dispatchEvent(new w.Event('input'));
const koSearch = d.querySelectorAll('#cards .mcard').length;
info.push('search "인터스텔라" (한글 제목) cards=' + koSearch);
if (koSearch !== 1) problems.push('korean search failed: ' + koSearch);
d.querySelector('#search').value = '';
d.querySelector('#search').dispatchEvent(new w.Event('input'));

// 평가 기록 뷰
w.CinemaUI.show('ratings');
const rBars = d.querySelectorAll('#rating-bars .dna-row').length;
const dBars = d.querySelectorAll('#dim-bars .dna-row').length;
const rList = d.querySelectorAll('#ratings-list .rec').length;
info.push('ratings view: reaction bars=' + rBars + ' dim bars=' + dBars + ' list=' + rList);
if (rBars !== 5) problems.push('reaction bars expected 5 got ' + rBars);
if (dBars !== 8) problems.push('dim bars expected 8 got ' + dBars);
if (rList !== 1) problems.push('ratings list expected 1 got ' + rList);

// 후보 전체 채점 안정성 + 적합도 범위
const ranked = w.CinemaEngine.rankCandidates(w.CinemaStore.all()).ranked;
info.push('ranked candidates=' + ranked.length);
ranked.forEach(r => {
  if (!(r.fit >= 12 && r.fit <= 97)) problems.push('fit out of range: ' + r.film.title + '=' + r.fit);
  if (r.strengths.length < 1) problems.push('no strengths computed: ' + r.film.title);
});
info.push('TOP6 = ' + ranked.slice(0, 6).map(r => r.film.title + ' ' + r.fit + '%').join(' | '));
info.push('BOTTOM4 = ' + ranked.slice(-4).map(r => r.film.title + ' ' + r.fit + '%').join(' | '));
const exSample = w.CinemaEngine.explain(ranked[0], prof);
info.push('sample explanation = ' + exSample.lead.replace(/<[^>]+>/g, ''));
info.push('sample risk = ' + exSample.riskLine.replace(/<[^>]+>/g, '').slice(0, 160));

// 초기화 동작
w.CinemaStore.reset();
info.push('after reset ratings=' + Object.keys(w.CinemaStore.raw().ratings).length);

/* ---------- 결과 출력 ---------- */
console.log('=== INFO ===');
info.forEach(i => console.log(' · ' + i));
console.log('=== console errors/warnings ===');
console.log(consoleErrors.length ? consoleErrors.join('\n') : ' (none)');
console.log('=== PROBLEMS ===');
console.log(problems.length ? problems.join('\n') : ' (none)');
process.exit(problems.length ? 1 : 0);
