/* ===========================================================
   data/ratings.js  —  사용자 평가 시드 데이터 (JSON 으로 교체 가능)
   -----------------------------------------------------------
   * 여기에 값을 넣으면 "처음 방문한 상태"의 평가 기록이 됩니다.
   * 형식 (app/store.js 의 localStorage 데이터와 동일 스키마):
       {
         "c-0-duneparttwo": {
           "reaction": "loved",              // loved | liked | okay | didntlike | hated
           "dims": { "world": 5, "visuals": 5, "music": 4 },
           "at": "2026-09-01T00:00:00.000Z"
         }
       }
   * 브라우저에 이미 저장된 평가가 있으면 그쪽이 우선합니다.
   * 서버·DB 로 옮길 때는 그대로 ratings 테이블로 사용하면 됩니다.
   =========================================================== */
window.SEED_RATINGS = {
  // 예시 (비워 두면 시드 없이 시작합니다):
  // "c-0-duneparttwo": { reaction: "loved", dims: { world: 5, visuals: 5, music: 5, originality: 4 }, at: "2026-09-01T00:00:00.000Z" }
};
window.SEED_FAVORITES = [];
