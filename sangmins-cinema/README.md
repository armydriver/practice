# Sangmin's Cinema — 개인 영화 큐레이터

취향 데이터를 12개 취향 축 + 6개 회피 축으로 분석하고, 태그 벡터 기반 weighted scoring으로
"오늘 볼 영화"를 추천하는 개인용 웹앱입니다.
빌드 도구·서버 없이 **index.html 을 브라우저로 열면 바로 동작**합니다(바닐라 JS, localStorage 저장).

---

## 1. 실행 방법

```bash
# 방법 A — 그냥 열기
#   sangmins-cinema/index.html 을 더블클릭 (Chrome/Edge/Safari)

# 방법 B — 로컬 서버(권장, 모든 브라우저에서 동일 동작)
cd sangmins-cinema
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

- 실행에 필요한 설치 패키지 없음. 외부 API·네트워크 호출 없음.
- 평가 데이터는 브라우저 `localStorage` 키 `sangmins-cinema-v1` 에만 저장됩니다.
- 초기 상태는 `data/movies.js` 의 시드 데이터이며, 평가 기록이 쌓이면 자동으로 추천 점수에 반영됩니다.

---

## 2. 파일 구성

```
sangmins-cinema/
├── index.html                 # 화면 구조(홈 / 취향 프로필 / 내 영화 목록 / 평가 기록) + 모달
├── css/
│   └── styles.css             # 다크 시네마 테마, 반응형(데스크톱·모바일) 스타일
├── data/
│   ├── taxonomy.js            # 취향 12축 + 회피 6축 정의(라벨·설명 문구)
│   ├── movies.js              # ★ 영화 데이터 (LIBRARY / CANDIDATES / 카테고리 가중치)
│   └── ratings.js             # 사용자 평가 시드(비어 있음 → 그냥 비워 두면 시드 없이 시작)
├── engine/
│   └── scoring.js             # 취향 프로필 생성 + 후보 채점 + 설명 생성 (핵심 알고리즘)
└── app/
    ├── store.js               # 평가·즐겨찾기·추천 이력 저장소(localStorage, JSON import/export)
    └── ui.js                  # 렌더링·이벤트·라우팅(뷰 전환)
```

### 영화를 추가·삭제하려면
`data/movies.js` 한 파일만 수정하면 됩니다.

```js
// 이미 본 영화 (LIBRARY)
{ t: 'Blade Runner 2049', ko: '블레이드 러너 2049', y: 2017, d: 'Denis Villeneuve',
  g: ['Sci-Fi','Mystery'],
  T: [.2,.98,.6,.9,.98,.9,.95,.85,.5,.9,.95,.45],   // 취향 12축 (0~1)
  A: [.6,.4,.3,.1,.2,.3],                            // 회피 6축 (0~1)
  m: ['실존적 질문','시각적 쾌감'], note: '메모' }

// 추천 후보 (CANDIDATES) — 같은 형식 + hook: '한 줄 소개'
```

- `T` / `A` 배열 순서는 `data/taxonomy.js` 의 `TASTE` / `AVOID` 배열 순서와 1:1 대응합니다.
- 가중치를 바꾸려면 `MOVIES.CATEGORY_WEIGHTS` 를 수정합니다.

```js
CATEGORY_WEIGHTS = { loved: 1.0, favorite: 1.35, craft: 0.30, craftLow: -0.45, disliked: -1.0 };
//                   ❤️ 좋아함     ⭐ 최애          🏆 명작인정     🤔 명작·취향아님   👎 별로
```

- `store.exportJSON()` 결과는 그대로 `ratings` 테이블 스키마로 쓸 수 있습니다:

```json
{ "version": 1,
  "ratings": { "c-15-dune": { "reaction": "loved",
      "dims": { "world": 5, "visuals": 5, "music": 4, "originality": 4 }, "at": "2026-09-29T..." } },
  "favorites": ["w-1-harrypotterseries"],
  "history": [{ "id": "c-15-dune", "fit": 91, "at": "2026-09-29T..." }] }
```

---

## 3. 추천 알고리즘 (engine/scoring.js)

1. **취향 벡터** — 좋아하는 영화의 태그를 카테고리 가중치로 가중 평균(+ 평가 보정).
   `loved +1.00 / favorite +1.35 / craft +0.30 / craftLow −0.45 / disliked −1.00`
2. **완성도 벡터** — `craft`(좋아하진 않지만 명작이라 인정한 영화)만 따로 평균. 취향과 분리해서 다룹니다.
3. **회피 벡터** — `disliked` · `craftLow` 영화에서 회피 축 평균.
4. **후보 점수**

```
fit = 30
    + 62 × (후보의 강한 축에서의 내 선호 가중 평균)     ← 취향 유사성 (핵심)
    + 15 × (완성도 축 정렬)                              ← 명작 신호
    − 26 × (별로였던 영화와의 태그 유사도)               ← 싫어한 것과의 유사성
    − 34 × (회피 축 신호 × 내 회피 성향)
    + 감독/장르 보정(이미 좋아한 감독 +3.4, 맞지 않았던 감독 −2.6)
```

5. **설명 생성** — 상위권 후보 중 가중 랜덤 선택 후, **태그 유사도가 가장 높은 내 영화 3편**을 찾아
   "『Ready Player One』에서 새로운 세계를 탐험하는 느낌을 좋아했다면…" 형태의 문장을 자동 생성합니다.
6. **평가 반영** — 저장한 반응(loved~hated)은 해당 영화의 가중치를 재계산하고, 요소별 평가(1~5)는
   취향 축을 축당 최대 ±0.12 보정합니다. 즉 추천 → 시청 → 평가 → 다음 추천의 루프가 닫힙니다.

### 표시 방식에 대한 두 가지 결정

- **취향 프로필 막대는 "취향 신호 강도"** 입니다. `좋아하는 영화 평균 − 별로였던 영화 평균` 을 0~100%로 옮긴 값으로,
  50%는 "좋아한 영화와 싫어한 영화에서 비슷한 수준(구분력이 낮은 축)"을 뜻합니다.
  실제 선호/비선호 수치도 막대 오른쪽에 함께 표기합니다. 채점 자체는 선호 가중 평균(`tasteAdj`)을 사용합니다.
- **포스터는 외부 이미지를 쓰지 않고 CSS로 생성**합니다. 영화 포스터 이미지는 저작권 문제가 있고,
  실제 API(TMDB) 연동 시에는 `film.poster` 에 URL을 넣기만 하면 되도록 `posterHTML()` 이 이미 준비되어 있습니다
  (로드 실패 시 자동으로 그라디언트 포스터로 대체).

적합도(%)는 **추정치**입니다. 실제 영화 품질 점수가 아니며 화면에도 그렇게 표기했습니다.

### 검증 스크립트 (선택)

```bash
cd sangmins-cinema && npm i jsdom && node tests/verify.js   # 데이터 무결성 + 런타임/렌더/저장 동작 확인
node tools/build-standalone.js                              # CSS·JS 인라인 단일 파일 HTML 생성
```

---

## 4. 다음에 추가할 수 있는 기능

1. **실제 영화 API 연동** — TMDB API로 포스터·러닝타임·출연진 자동 수집(현재는 그라디언트 폴백 포스터).
2. **평가 데이터 서버화** — Supabase/Firebase로 `ratings` 테이블 이전(JSON 스키마가 이미 테이블 형태).
3. **협업 필터링** — 지금은 콘텐츠 기반(태그 벡터)만. 사용자·평점 행렬이 쌓이면 item-item CF 추가.
4. **감독·작가 단위 탐색** — Christopher Nolan / Denis Villeneuve 처럼 이미 강한 신호가 있는 감독의 필모 전체 보기.
5. **취향 변화 추적** — 평가 이력 타임라인으로 "예전엔 별로였는데 요즘 좋아하는" 축 변화 그래프.
6. **보지 않은 영화 태그 자동 추정** — 제목만 입력하면 태그를 자동 추정해 후보 풀에 추가(현재는 수동 태깅).
7. **오늘의 추천 이력 상세** — 추천 당시의 점수 구성(축별 기여도)을 저장해 나중에 복기.
8. **PWA/오프라인** — manifest + service worker로 홈 화면 설치, 오프라인 사용.
