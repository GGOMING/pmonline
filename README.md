# 여신전쟁 (Goddess War)

워크3 카드 게임 "여신전쟁"의 단일 페이지 웹 게임 재현판입니다. 빌드 도구나 백엔드 없이 정적 HTML 한 장으로 동작하며, 세이브는 브라우저 localStorage에 저장됩니다.

## 🎮 게임 개요

- **카드 시스템**: 일반 80종 / 레어 40종 / 유니크 6종 / 영웅 5종 + 기본공격 (총 132종)
- **전투 모드**: 수행 (사냥) · 회복의 샘물 · 카드샵 · 무기상점 · 방어구상점 · 훈련소 · 랭킹전 · 공격대 (새벽의 언덕·안개의 숲)
- **계정 시스템**: 회원가입·로그인 · 같은 브라우저 내 다계정 격리 (각 계정별 localStorage 슬롯)
- **관리자 패널**: 우상단 🔧 ADMIN · ID `admin` / PW `1234` — 유저 편집, 카드 덱·인벤토리·장비 직접 조작, 가챠/판매가/공격대 보스 교체, 전 계정 일괄 지급, 백업 복원, 데이터 import/export

## 📂 폴더 구조

```
.
├── index.html              ← 게임 본체 (단일 HTML)
├── assets/
│   ├── pmcards/   (129장)  ← 카드 이미지 (pmlist2.jpg에서 추출)
│   └── wc3_icons/ (125장)  ← UI/무기/방어구/보스 아이콘
├── vercel.json             ← 배포 캐시 헤더 설정
├── .gitignore
└── README.md
```

## 🚀 로컬 실행

별도 설치 없이 `index.html`을 브라우저(Chrome / Edge / Safari)로 직접 열면 됩니다.

```bash
# 또는 간단한 정적 서버로 실행 (캐시 동작 확인 시)
python -m http.server 8000
# → http://localhost:8000 접속
```

## ☁️ Vercel 배포

### 방법 1: GitHub 연동 (권장)

1. 이 폴더를 새 GitHub 리포지토리에 푸시합니다.
   ```bash
   cd <이 폴더>
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
2. [Vercel 대시보드](https://vercel.com/new)에서 해당 리포지토리를 import합니다.
3. 프레임워크는 **Other / Static**로 자동 인식됩니다. 빌드 명령·출력 디렉토리는 비워두고 그대로 Deploy를 누르면 됩니다.
4. 몇 초 뒤 `https://<프로젝트명>.vercel.app/` 에서 게임이 호스팅됩니다.

### 방법 2: Vercel CLI

```bash
npm i -g vercel
vercel        # 첫 배포 (프로젝트 생성 프롬프트)
vercel --prod # 프로덕션 배포
```

## 🔌 데이터 모델 (localStorage 키)

| 키 | 용도 |
|---|---|
| `yeoshin_accounts_v1` | 가입된 모든 계정 이름 목록 (JSON 배열) |
| `yeoshin_save_v1__<아이디>` | 각 계정의 캐릭터·카드·덱 데이터 |
| `yeoshin_save_v1__<아이디>_bk1/2/3` | 자동 회전 백업 슬롯 3개 |
| `yeoshin_last_user_v1` | 마지막 로그인 아이디 (자동 채움) |
| `yeoshin_layout` | PC/모바일 레이아웃 선택 |
| `yeoshin_save_v1` | 구버전 단일 슬롯 (자동 마이그레이션) |

⚠️ **다른 디바이스 간 데이터 동기화는 지원하지 않습니다.** localStorage는 브라우저별·도메인별 격리되므로 진짜 멀티 디바이스 멀티유저가 필요하면 서버 백엔드 도입이 필요합니다.

## 🛠 기술 스택

- 순수 HTML / CSS / JavaScript (단일 파일, 빌드 도구 없음)
- localStorage 기반 영속화
- 워크래프트3 아이콘 + pmlist2 카드 이미지 자산
- Vercel 정적 호스팅

## 📝 라이선스 / 출처

- 게임 시스템은 옛 플래시 카드 게임 "여신전쟁"을 참고한 재현 프로젝트입니다.
- 카드 이미지(`assets/pmcards/`)는 원본 카드 시트 pmlist2.jpg 에서 분할 추출했습니다.
- UI/유닛 아이콘(`assets/wc3_icons/`)은 Blizzard Entertainment의 Warcraft 3 자산입니다 — 비상업적 팬 프로젝트 용도로만 사용합니다.
