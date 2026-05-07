# dev.log Backend

dev.log 블로그 플랫폼의 REST API 서버. 프론트엔드(`http://localhost:3000`)의 요청을 처리하고 PostgreSQL에 데이터를 저장한다.

- **포트**: `3001`
- **CORS Origin**: `http://localhost:3000`
- **DB**: PostgreSQL (`localhost:5432`)

---

## 기술 스택

| 항목         | 기술             | 비고                              |
| ------------ | ---------------- | --------------------------------- |
| 프레임워크   | NestJS v11       | REST API                          |
| 언어         | TypeScript v5.7  |                                   |
| 데이터베이스 | PostgreSQL 15    | TypeORM v0.3, `synchronize: true` |
| 인증         | JWT              | Access + Refresh Token            |
| 비밀번호     | bcryptjs         | 이메일 가입 시 해시               |
| 환경 변수    | @nestjs/config   | `.env.local`                      |
| 테스트       | Jest + Supertest | unit / e2e                        |

---

## 사전 준비

### 1. PostgreSQL 실행

[backend/docker-compose.yml](docker-compose.yml)로 컨테이너를 띄운다.

```bash
docker compose up -d postgres
```

기본 계정: `postgres / postgres`, DB명: `devlog`.

### 2. 환경 변수

`backend/.env.local` 파일을 생성한다.

```env
DB_NAME=devlog
DB_USERNAME=postgres
DB_PASSWORD=postgres
```

| 변수          | 필수 | 설명                |
| ------------- | ---- | ------------------- |
| `DB_NAME`     | O    | PostgreSQL DB 이름  |
| `DB_USERNAME` | O    | PostgreSQL 유저명   |
| `DB_PASSWORD` | O    | PostgreSQL 비밀번호 |

### 3. 의존성 설치

```bash
npm install
```

---

## 실행

```bash
# 개발 (watch 모드)
npm run start:dev

# 빌드
npm run build

# 프로덕션 실행
npm run start:prod

# 린트 (자동 수정 포함)
npm run lint
```

### Docker 빌드

```bash
docker build -t devlog-backend .
docker run -p 3001:3001 --env-file .env.local devlog-backend
```

---

## 테스트

```bash
npm run test          # unit
npm run test:watch    # watch 모드
npm run test:cov      # 커버리지
npm run test:e2e      # E2E
```

테스트 파일 패턴: `**/*.spec.ts` (rootDir: `src/`)

---

## 프로젝트 구조

```
src/
├── main.ts              # 앱 진입점 (CORS, 글로벌 필터, 포트 3001)
├── app.module.ts        # 루트 모듈 (Config, TypeORM, 기능 모듈 등록)
├── auth/                # 인증 모듈 — /auth/*
├── blog/                # 블로그 모듈 (컨트롤러 없음, AuthService에서 호출)
├── post/                # 포스트 모듈 — /post/*
├── comment/             # 댓글 모듈 (WIP)
├── tag/                 # 태그 모듈 (WIP)
└── common/              # 공통 유틸 (트랜잭션 인터셉터, 예외 필터, 페이지네이션)
```

상세 구조는 [docs/backend-architecture.md](docs/backend-architecture.md) 참고.

---

## 주요 모듈

| 모듈      | 역할                                                               | 엔드포인트   |
| --------- | ------------------------------------------------------------------ | ------------ |
| `auth`    | 유저 인증, JWT 발급/갱신, 유저 CRUD                                | `/auth/*`    |
| `post`    | 포스트 CRUD, 좋아요, 커서 페이지네이션                             | `/post/*`    |
| `blog`    | 유저 생성 시 트랜잭션으로 블로그 동시 생성                         | -            |
| `comment` | 댓글 (Entity만 정의, Service/Controller 미구현)                    | `/comment/*` |
| `tag`     | 태그 (Entity만 정의)                                               | -            |
| `common`  | `TransactionInterceptor`, `HttpExceptionFilter`, 커서 페이지네이션 | -            |

---

## API 요약

### Auth (`/auth`)

| Method | Path                        | Guard                  | 설명                              |
| ------ | --------------------------- | ---------------------- | --------------------------------- |
| POST   | `/auth/signIn`              | -                      | 로그인, Access+Refresh Token 발급 |
| POST   | `/auth/access`              | RefreshTokenGuard      | Refresh → Access Token 갱신       |
| GET    | `/auth/users`               | -                      | 전체 유저 목록                    |
| GET    | `/auth/users/:userId`       | -                      | UUID로 유저 조회                  |
| GET    | `/auth/users/:email/exists` | -                      | 이메일 존재 여부 (`{ exists }`)   |
| GET    | `/auth/users/email/:email`  | -                      | 이메일로 유저 조회                |
| POST   | `/auth/users`               | TransactionInterceptor | 유저 + 블로그 동시 생성           |

### Post (`/post`)

| Method | Path                  | Guard                     | 설명                            |
| ------ | --------------------- | ------------------------- | ------------------------------- |
| POST   | `/post`               | AccessToken + Transaction | 포스트 생성                     |
| GET    | `/post?cursor=number` | -                         | 포스트 목록 (커서 페이지네이션) |
| GET    | `/post/:userId/:path` | -                         | 포스트 상세                     |
| POST   | `/post/like/:postId`  | AccessTokenGuard          | 좋아요 추가                     |
| DELETE | `/post/like/:postId`  | AccessTokenGuard          | 좋아요 취소                     |

전체 API 명세는 [docs/api-design.md](docs/api-design.md), [docs/backend-architecture.md](docs/backend-architecture.md) 참고.

---

## 핵심 패턴

### 트랜잭션 처리

`TransactionInterceptor`가 `QueryRunner`를 생성해 `request.queryRunner`에 주입한다. 컨트롤러는 `@QueryRunnerDeco()`로 받아 서비스에 넘긴다.

```typescript
@Post('users')
@UseInterceptors(TransactionInterceptor)
async createUser(
  @Body() dto: CreateUserDto,
  @QueryRunnerDeco() qr: QueryRunner,
) {
  return this.authService.createUser(dto, qr);
}
```

서비스에서는 `qr.manager.getRepository()`로 얻은 레포지토리만 동일 트랜잭션에 참여한다.

### 인증 가드

`BearerTokenGuard`(추상)를 상속한 `AccessTokenGuard` / `RefreshTokenGuard`가 `Authorization: Bearer <token>` 헤더를 검증하고, `request.user`와 `request.tokenInfo`를 주입한다.

### 커서 페이지네이션

`CommonService.cursorPaginate()`가 `id DESC` 정렬 + `take + 1` 조회로 `hasNext`를 판별한다. 반환값: `{ data, hasNext, cursor: { after }, count }`.

---

## 참조 문서

| 문서            | 경로                                                         | 설명                                        |
| --------------- | ------------------------------------------------------------ | ------------------------------------------- |
| 백엔드 아키텍처 | [docs/backend-architecture.md](docs/backend-architecture.md) | 모듈, 엔티티, API, 트랜잭션 패턴 인수인계용 |
| API 설계        | [docs/api-design.md](docs/api-design.md)                     | 좋아요 등 API 설계 결정 기록                |
| 작업 로그       | [docs/work-log.md](docs/work-log.md)                         | 날짜별 작업 내역, 미완료 항목               |

---

## 미완성 항목

| 항목                                               | 우선순위 |
| -------------------------------------------------- | -------- |
| JWT Secret 환경변수 이전 (`'secret_key'` 하드코딩) | 높음     |
| 프로덕션 마이그레이션 (`synchronize: false`)       | 높음     |
| `CommentModule` Service/Controller                 | 중간     |
| 토큰 블랙리스트 (로그아웃 시 무효화)               | 중간     |
| 이미지 업로드 API                                  | 중간     |
| `TagModule` 구현                                   | 낮음     |
| `BlogModule` 컨트롤러                              | 낮음     |

상세는 [docs/backend-architecture.md](docs/backend-architecture.md) 참고.
