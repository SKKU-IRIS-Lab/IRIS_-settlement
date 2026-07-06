# 정산 앱

GitHub Pages에 올릴 수 있는 정적 HTML/CSS/JS 정산 앱입니다. Firebase 설정을 넣기 전에는 브라우저 `localStorage`에 저장되고, 설정을 넣으면 Firebase Realtime Database로 실시간 동기화됩니다.

## 로컬 실행

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## Firebase 연결

1. Firebase Console에서 프로젝트를 만듭니다.
2. Realtime Database를 생성합니다.
3. Rules에 `firebase-rules.json` 내용을 붙여넣습니다.
4. 웹 앱을 추가하고 Firebase config를 복사합니다.
5. `app.js` 상단을 아래처럼 바꿉니다.

```js
const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "https://...firebaseio.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
const FIREBASE_DB_URL = "https://...firebaseio.com";
```

Firebase API key는 브라우저에 들어가는 공개 설정값입니다. 보안은 긴 `tripId` 링크와 Realtime Database Rules로 제한합니다.

## GitHub Pages 배포

1. GitHub에서 새 repository를 만듭니다.
2. 이 폴더 파일을 push합니다.
3. Repository Settings > Pages에서 branch 배포를 켭니다.
4. 발급된 Pages URL을 열고, 생성된 `#/trip/...` 링크를 같이 쓸 사람에게 공유합니다.

## 데이터 구조

```text
trips/{tripId}/meta
trips/{tripId}/members
trips/{tripId}/expenses
trips/{tripId}/settled
```
