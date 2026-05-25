# 관리자 페이지 설계 문서

## 개요

dev.log 블로그 플랫폼의 관리자 페이지 설계.
NestJS 백엔드에 `AdminModule`을 추가하고, 정적 HTML/CSS/JS 파일로 UI를 제공한다.
이후 Next.js 프론트엔드로 이관 예정.

---

## 1. 데이터 모델 변경

### 1-1. UserRole enum 추가 (`user.entity.ts`)

```typescript
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
```

### 1-2. UserModel에 role 컬럼 추가

```typescript
@Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
role: UserRole;
```

- 기본값: `USER`
- 관리자 계정은 DB에서 직접 `role = 'ADMIN'`으로 설정
- `synchronize: true` 환경이므로 서버 재시작 시 자동 반영

---

## 2. 디렉터리 구조

### 백엔드

```
src/
└── admin/
    ├── admin.module.ts
    ├── admin.controller.ts         # /admin/* API 엔드포인트
    ├── admin.service.ts            # 비즈니스 로직 (통계, CRUD)
    ├── guard/
    │   └── admin.guard.ts          # AccessTokenGuard 상속 + role 검증
    └── dto/
        ├── admin-user-query.dto.ts
        ├── admin-post-query.dto.ts
        ├── admin-comment-query.dto.ts
        └── update-user-status.dto.ts
```

### 정적 파일 (UI)

```
public/
└── admin/
    ├── login.html
    ├── dashboard.html
    ├── users.html
    ├── users-detail.html
    ├── posts.html
    ├── posts-detail.html
    ├── comments.html
    ├── css/
    │   └── admin.css
    └── js/
        ├── api.js        # fetch 래퍼 (Authorization 헤더 자동 주입)
        ├── auth.js       # 로그인/로그아웃, localStorage 토큰 관리
        └── common.js     # 사이드바 렌더링, 유틸리티 함수
```

---

## 3. AdminGuard 설계

기존 `AccessTokenGuard`를 상속하여 JWT 검증 로직을 재사용한다.
`super.canActivate()` 성공 후 `req.user.role === ADMIN` 여부를 추가 검증한다.

```typescript
@Injectable()
export class AdminGuard extends AccessTokenGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const req = context.switchToHttp().getRequest();
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('관리자 권한이 필요합니다.');
    }
    return true;
  }
}
```

---

## 4. API 설계

### 4-1. 공통

- 모든 엔드포인트: `@UseGuards(AdminGuard)` 적용
- 응답 형식: 기존 `cursorPaginate` 반환 구조 재사용
  ```json
  { "data": [...], "hasNext": true, "cursor": { "after": 10 }, "count": 20 }
  ```
- 에러 응답: 기존 `HttpExceptionFilter` 형식 그대로

### 4-2. 대시보드

| Method | Path | 설명 |
|--------|------|------|
| GET | `/admin/dashboard` | 통계 데이터 반환 |

**응답 예시**
```json
{
  "totalUsers": 120,
  "activeUsers": 110,
  "blockedUsers": 5,
  "withdrawnUsers": 5,
  "totalPosts": 340,
  "publishedPosts": 300,
  "draftPosts": 40,
  "totalComments": 890,
  "totalLikes": 1200
}
```

### 4-3. 유저 관리

| Method | Path | 설명 |
|--------|------|------|
| GET | `/admin/users` | 목록 조회 |
| GET | `/admin/users/:id` | 상세 조회 |
| PATCH | `/admin/users/:id/status` | 상태 변경 (ACTIVE / BLOCKED) |
| DELETE | `/admin/users/:id` | 강제 탈퇴 처리 |

**GET /admin/users 쿼리 파라미터**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `cursor` | number | - | 커서 (id 기준) |
| `take` | number | 20 | 페이지 크기 |
| `search` | string | - | email, user_id, user_name 검색 |
| `status` | string | - | ACTIVE \| BLOCKED \| WITHDRAWN |

**PATCH /admin/users/:id/status 요청 Body**
```json
{ "status": "BLOCKED" }
```

### 4-4. 포스트 관리

| Method | Path | 설명 |
|--------|------|------|
| GET | `/admin/posts` | 목록 조회 |
| GET | `/admin/posts/:id` | 상세 조회 |
| PATCH | `/admin/posts/:id/visibility` | 공개/비공개 토글 |
| DELETE | `/admin/posts/:id` | 강제 삭제 (hard delete) |

**GET /admin/posts 쿼리 파라미터**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `cursor` | number | - | 커서 (id 기준) |
| `take` | number | 20 | 페이지 크기 |
| `search` | string | - | title 검색 |
| `visibility` | boolean | - | 공개 여부 필터 |
| `status` | string | - | draft \| published |

### 4-5. 댓글 관리

| Method | Path | 설명 |
|--------|------|------|
| GET | `/admin/comments` | 목록 조회 |
| DELETE | `/admin/comments/:id` | 강제 삭제 |

**GET /admin/comments 쿼리 파라미터**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `cursor` | number | - | 커서 (id 기준) |
| `take` | number | 20 | 페이지 크기 |
| `search` | string | - | content, 작성자 검색 |

---

## 5. 정적 UI 설계

### 5-1. 공통 레이아웃 (dashboard.html 이후 모든 페이지)

```
┌─────────────────────────────────────────────┐
│  [dev.log Admin]          관리자명  [로그아웃] │  ← 상단 헤더
├──────────┬──────────────────────────────────┤
│          │                                  │
│ 대시보드  │          메인 콘텐츠              │
│ 유저 관리 │                                  │
│ 포스트    │                                  │
│ 댓글     │                                  │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

- 사이드바 활성 메뉴는 현재 페이지 URL로 판별 (`common.js`)
- Bootstrap 5 CDN 사용

### 5-2. 로그인 페이지 (`login.html`)

```
┌─────────────────────────────────────────────┐
│                                             │
│            ┌─────────────────┐              │
│            │  dev.log Admin  │              │
│            │                 │              │
│            │  이메일         │              │
│            │  [____________] │              │
│            │                 │              │
│            │  비밀번호        │              │
│            │  [____________] │              │
│            │                 │              │
│            │  [   로그인   ] │              │
│            └─────────────────┘              │
│                                             │
└─────────────────────────────────────────────┘
```

- 로그인 성공 시 `localStorage`에 `accessToken`, `refreshToken` 저장 후 `/admin/dashboard.html` 리다이렉트
- 이미 토큰이 있으면 `/admin/dashboard.html`로 자동 리다이렉트

### 5-3. 대시보드 (`dashboard.html`)

```
┌──────────────────────────────────────────────────┐
│  총 유저    │  활성 유저  │  차단 유저  │  탈퇴 유저 │
│    120     │    110     │     5      │     5      │
├──────────────────────────────────────────────────┤
│  총 포스트  │  게시됨     │  초안      │  총 댓글   │
│    340     │    300     │    40      │    890     │
└──────────────────────────────────────────────────┘
```

### 5-4. 유저 목록 (`users.html`)

```
[검색창___________] [상태 필터 ▼]

┌────────┬──────────┬──────────────┬──────────┬────────┬────────────┬────────┐
│ user_id│ 이름     │ 이메일        │ 가입방식  │ 상태   │ 가입일      │ 액션   │
├────────┼──────────┼──────────────┼──────────┼────────┼────────────┼────────┤
│ abc123 │ 홍길동   │ aaa@bbb.com  │ EMAIL    │ ACTIVE │ 2025-01-01 │ 보기   │
└────────┴──────────┴──────────────┴──────────┴────────┴────────────┴────────┘

[더 보기]
```

### 5-5. 유저 상세 (`users-detail.html`)

- 유저 정보 카드 (user_id, user_name, email, provider, status, 가입일)
- 상태 변경 버튼: ACTIVE ↔ BLOCKED
- 강제 탈퇴 버튼 (확인 다이얼로그 후 실행)
- 해당 유저의 최근 포스트 목록 (5개)

### 5-6. 포스트 목록 (`posts.html`)

```
[검색창___________] [공개여부 ▼] [상태 ▼]

┌──────────────────┬────────┬──────────┬────────┬────────────┬────────┐
│ 제목             │ 작성자 │ 공개여부  │ 상태   │ 작성일      │ 액션   │
├──────────────────┼────────┼──────────┼────────┼────────────┼────────┤
│ 포스트 제목...   │ abc123 │ 공개     │ 게시됨 │ 2025-01-01 │ 보기   │
└──────────────────┴────────┴──────────┴────────┴────────────┴────────┘

[더 보기]
```

### 5-7. 댓글 목록 (`comments.html`)

```
[검색창___________]

┌──────────────────────────┬──────────────┬────────┬────────────┬────────┐
│ 내용 (최대 50자)          │ 포스트 제목  │ 작성자 │ 작성일      │ 액션   │
├──────────────────────────┼──────────────┼────────┼────────────┼────────┤
│ 댓글 내용 미리보기...     │ 포스트 제목  │ abc123 │ 2025-01-01 │ 삭제   │
└──────────────────────────┴──────────────┴────────┴────────────┴────────┘

[더 보기]
```

---

## 6. 프론트엔드 JS 설계

### `js/api.js` — fetch 래퍼

```javascript
// 모든 API 호출에 Authorization 헤더 자동 주입
// 401 응답 시 로그인 페이지로 리다이렉트
async function apiFetch(url, options = {}) { ... }
```

### `js/auth.js` — 인증 관리

```javascript
// 토큰 저장/조회/삭제 (localStorage)
// 로그인: POST /auth/signIn → 토큰 저장
// 로그아웃: 토큰 삭제 후 login.html 이동
// 페이지 진입 시 토큰 없으면 login.html 리다이렉트
```

### `js/common.js` — 공통 유틸

```javascript
// 사이드바 현재 메뉴 활성화 처리
// 날짜 포맷 함수
// 확인 다이얼로그 헬퍼
// 테이블 행 렌더링 헬퍼
```

---

## 7. ServeStaticModule 설정

```typescript
// app.module.ts에 추가
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'public'),
  serveRoot: '/admin',      // /admin/* 경로로 정적 파일 제공
  exclude: ['/admin/api*'], // API 경로 제외
})
```

> **주의**: NestJS 컨트롤러 경로(`/admin/users` 등)와 정적 파일 경로(`/admin/users.html`)는
> 파일 확장자로 구분되므로 충돌하지 않는다.

---

## 8. 개발 체크리스트

### Phase 1 — 기반 구축
- [ ] `UserModel`에 `UserRole` enum 및 `role` 컬럼 추가
- [ ] `AdminGuard` 구현 (`AccessTokenGuard` 상속)
- [ ] `AdminModule` 생성 및 `AppModule`에 등록
- [ ] `ServeStaticModule` 설치 및 설정
- [ ] `public/admin/` 디렉터리 생성

### Phase 2 — 대시보드
- [ ] `GET /admin/dashboard` API 구현
- [ ] `dashboard.html` + 통계 카드 UI

### Phase 3 — 유저 관리
- [ ] `GET /admin/users` API 구현 (페이지네이션 + 검색 + 필터)
- [ ] `GET /admin/users/:id` API 구현
- [ ] `PATCH /admin/users/:id/status` API 구현
- [ ] `DELETE /admin/users/:id` API 구현
- [ ] `users.html` + `users-detail.html` UI

### Phase 4 — 포스트 관리
- [ ] `GET /admin/posts` API 구현
- [ ] `GET /admin/posts/:id` API 구현
- [ ] `PATCH /admin/posts/:id/visibility` API 구현
- [ ] `DELETE /admin/posts/:id` API 구현 (hard delete)
- [ ] `posts.html` + `posts-detail.html` UI

### Phase 5 — 댓글 관리
- [ ] `GET /admin/comments` API 구현
- [ ] `DELETE /admin/comments/:id` API 구현
- [ ] `comments.html` UI

### Phase 6 — 로그인 페이지
- [ ] `login.html` UI
- [ ] `js/auth.js` 토큰 관리 구현
- [ ] `js/api.js` fetch 래퍼 구현
- [ ] `js/common.js` 공통 유틸 구현

---

## 9. 보안 고려사항

- AdminGuard 미적용 엔드포인트가 없도록 컨트롤러 레벨에서 `@UseGuards(AdminGuard)` 적용
- 강제 삭제(DELETE)는 UI에서 확인 다이얼로그 필수
- 토큰을 `localStorage`에 저장하므로 XSS 방지를 위해 innerHTML 직접 삽입 금지 — `textContent` 또는 `createElement` 사용
- CORS는 기존 설정(`http://localhost:3000`) 유지 — 정적 파일은 같은 NestJS 서버에서 제공되므로 추가 설정 불필요
