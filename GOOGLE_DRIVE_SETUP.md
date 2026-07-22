# 전투 로그 → Google Drive 업로드 설정 가이드

## 개요
매 전투 종료 시 CSV 파일 1개를 Google Drive 에 업로드합니다.
폴더 구조: `{Root}/{유저닉네임}/{YYYY-MM-DD}/{battleId}.csv`

## 유저가 할 일 (총 5단계, 약 20~30분)

### 1) Google Cloud Console — OAuth 2.0 Client 생성

1. https://console.cloud.google.com/ 접속 (본인 Google 계정으로 로그인)
2. 상단 프로젝트 선택 → 새 프로젝트 생성 (이름: `yeoshin-battle-log` 등)
3. 좌측 메뉴 → **API 및 서비스** → **라이브러리** → "Google Drive API" 검색 → **사용 설정**
4. **API 및 서비스** → **OAuth 동의 화면**:
   - User Type: **외부** 선택
   - 앱 이름·이메일 입력 → 저장
   - **테스트 사용자** 에 본인 Gmail 추가 (프로덕션 심사 없이 계속 쓰려면 필수)
5. **API 및 서비스** → **사용자 인증 정보** → **사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**:
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: `battle-log-uploader`
   - **승인된 리디렉션 URI** 에 다음 추가: `https://developers.google.com/oauthplayground`
   - 저장 → **Client ID** 와 **Client Secret** 을 메모장에 복사해둡니다

### 2) Refresh Token 발급 (OAuth Playground)

1. https://developers.google.com/oauthplayground 접속
2. 우측 상단 톱니바퀴 (⚙) 클릭 → **Use your own OAuth credentials** 체크 → Client ID·Secret 붙여넣기 → Close
3. 좌측 **Step 1** — 입력창에 직접 입력: `https://www.googleapis.com/auth/drive.file` → **Authorize APIs** 클릭
4. 본인 Google 계정 로그인 → 앱이 "확인되지 않음" 경고 뜨면 **고급 → (앱 이름) 으로 이동** 클릭 → 허용
5. **Step 2** — **Exchange authorization code for tokens** 클릭
6. 응답 창에 **`Refresh token: 1//...`** 값이 나타남 → 메모장에 복사 (이 토큰은 재발급 안 하면 계속 유효)

### 3) 저장할 Drive 폴더 만들기

1. https://drive.google.com/ 접속
2. 원하는 위치에 폴더 생성 (예: `battle_logs`)
3. 폴더 열기 → 브라우저 주소창의 URL 확인:
   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                          └────── Folder ID ──────┘
   ```
4. `1AbCd...` 부분이 **폴더 ID** 입니다. 복사해둡니다.

### 4) Vercel 환경변수 등록

1. Vercel Dashboard → 여전 프로젝트 → **Settings** → **Environment Variables**
2. 다음 4개 등록 (모든 환경: Production/Preview/Development 전부 체크):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | (1단계에서 받은 Client ID) |
| `GOOGLE_CLIENT_SECRET` | (1단계에서 받은 Client Secret) |
| `GOOGLE_REFRESH_TOKEN` | (2단계에서 받은 Refresh token) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | (3단계에서 받은 폴더 ID) |

3. 저장 후 프로젝트 재배포 (Deployments → 최근 커밋 → Redeploy)

### 5) 테스트

1. 배포 완료 후 게임 접속
2. 아무 전투나 1회 진행
3. F12 개발자 도구 → Network 탭에서 `battle-log` POST 요청 확인
4. Google Drive `battle_logs/유저닉/YYYY-MM-DD/` 폴더에 `.csv` 파일이 생성되는지 확인

## 트러블슈팅

**"401 Unauthorized"**
- Refresh token 이 만료됐거나 잘못 붙여넣음 → 2단계 다시 수행

**"invalid_grant"**
- Refresh token 이 7일 후 자동 만료 (테스트 앱 모드에서). **OAuth 동의 화면 → 게시 상태 → "게시" 로 전환** 하면 무한 유효.

**"403 File not found" or 폴더 접근 실패**
- Refresh token 을 발급받은 Google 계정과 Drive 폴더 소유주가 달라야 합니다 → 동일 계정으로 통일

**"CORS error"**
- `api/battle-log.js` 는 이미 `Access-Control-Allow-Origin: *` 설정. 브라우저 캐시 문제일 가능성 → 하드 리로드

**"파일이 안 올라옴"**
- F12 콘솔에 `[battle-log fetch]` 오류 로그 확인
- Vercel Dashboard → Functions → `api/battle-log` 로그 확인

## 저장되는 CSV 예시

```csv
# BATTLE SUMMARY
battle_id,user_id,type,started_at,ended_at,duration_sec,turns_played,result,...
b_260722_143211_홍길동_a3f2,홍길동,hunt,2026-07-22T14:32:11+09:00,2026-07-22T14:33:05+09:00,54,12,win,...

# TURN DETAIL
turn,my_card,mon_card,my_dmg,mon_dmg,my_hp_after,my_mp_after,mon_hp_after,mon_mp_after
1,basic_atk,basic_atk,25,12,238,110,155,50
2,n41,n05,0,15,223,60,155,45
...
```

## 비용
- Google Drive: 저장 용량만 소비 (5TB 여유 있음)
- Google Drive API: 무료 (프로젝트당 초당 1,000 req 한도, 게임 규모로 절대 못 넘김)
- Vercel Serverless Function: Hobby 플랜 무료 (월 100 GB-hr 실행 시간 · 100만 req)

## 비활성화
`index.html` 상단의 `const BATTLE_LOG_ENABLED = true;` 를 `false` 로 바꾸면 전송 중단.
