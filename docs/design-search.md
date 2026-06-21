# 검색 기능 설계 보고서 (v4)

> 작성일: 2026-06-20 | 개정: CTO 1차 검토 반영 (v7)
> 대상 기능: 사이드바 검색 (히스토리 / 자동완성 / 연관 검색어)

---

## 1. 개요

### 목표

| 기능 | 설명 | 노출 시점 |
|------|------|-----------|
| 검색 히스토리 | 사용자가 이전에 검색한 키워드 목록 | 입력창 포커스 시 (쿼리 없을 때) |
| 자동완성 | 입력 중 매칭되는 포스트 제목 / 태그 실시간 제안 | 타이핑 중 (debounce 300ms) |
| 연관 검색어 | 검색 결과 상단에 연관 태그 노출 | 검색 결과 첫 페이지에만 |

### 기술 선택

| 항목 | 선택 |
|------|------|
| 검색 엔진 | OpenSearch 2.x |
| OpenSearch 클라이언트 | `@opensearch-project/opensearch` |
| NestJS 통합 | Custom Provider (직접 주입) |
| 검색 히스토리 | 프론트엔드 localStorage |
| 자동완성 | edge_ngram + nori multi-field |
| 연관 태그 | OpenSearch `terms aggregation` (첫 페이지 한정) |
| suggest 캐시 | Redis (TTL 60s) |
| 서킷브레이커 | opossum |
| 재시도 큐 | BullMQ + Redis |
| DLQ | PostgreSQL `search_sync_failures` 테이블 (Redis 장애 영향 없음) |

### 검색 범위

- 전역 검색: `GET /posts/search?q=...`
- 블로그 내 검색: `GET /posts/search?q=...&userId={userId}`

### 동기화 보장 수준

**베스트 에포트(best-effort)**. PostgreSQL 커밋 직후 프로세스 크래시 시 색인 이벤트가 유실될 수 있다. BullMQ 재시도로 일시적 장애를 커버하고, **주 1회 전체 reindex 스케줄러**로 누적 불일치를 보정한다. 완전한 보장이 필요하면 Outbox 패턴 도입이 필요하며, 현재 단계에서는 채택하지 않는다.

---

## 2. 아키텍처

```
[Frontend]
  검색 입력창
  ├── 포커스 + 쿼리 없음 → localStorage 히스토리 드롭다운
  ├── 타이핑 (debounce 300ms) → GET /posts/search/suggest?q=...
  │     ├── Redis HIT → 즉시 반환
  │     ├── Redis MISS → OpenSearch → Redis 저장(TTL 60s) → 반환
  │     └── Redis 장애 (connection refused 또는 3회 연속 500ms timeout)
  │           → OpenSearch 직접 조회 (degraded mode, 503 반환 안 함)
  │           → degraded 중 write 캐시 스킵
  │           → 10초마다 ping probe, 2회 연속 성공 시 normal 전환 + 실패 카운터 초기화
  │             (복구 후 캐시는 TTL 만료로 자연 갱신, 별도 동기화 불필요)
  └── 엔터 → GET /posts/search?q=... → 히스토리 localStorage 저장

[Backend — SearchModule]
  GET /posts/search/suggest  → SearchService.suggest()  → Redis → OpenSearch
  GET /posts/search          → SearchService.search()   → OpenSearch
  POST /admin/search/reindex → (AdminGuard) → BullMQ Job → jobId 반환

[이벤트 동기화 흐름]
  PostService
  ├── PostgreSQL 저장
  └── req.pendingSearchEvents 배열에 이벤트 등록 (발행은 하지 않음)

  TransactionInterceptor (커밋 완료 후)
  └── req.pendingSearchEvents 순회 → EventEmitter2.emit('post.sync', event)
        각 emit은 try/catch로 감싸 — 개별 실패 시 로그 후 계속 진행 (부분 누락 허용, 주간 reindex 보정)

  SearchSyncHandler (@OnEvent)
  ├── OpenSearch 색인/수정/삭제 시도
  ├── 성공 → 완료
  └── 실패 → BullMQ `search-sync` 큐에 재시도 잡 (5회, exponential backoff)
             최종 실패 → PostgreSQL `search_sync_failures` 테이블에 기록

[보정 스케줄러]
  @Cron('0 3 * * 0') → 매주 일요일 새벽 3시 reindex 잡 트리거

[서킷브레이커]
  opossum: volumeThreshold 5, errorThresholdPercentage 50%, resetTimeout 30s
  → OPEN 시 503 반환, 타 모듈 영향 없음
```

**이벤트 등록/발행 역할 분리**

| 역할 | 담당 | 근거 |
|------|------|------|
| 이벤트 등록 | `PostService` | 검색 동기화 필요 여부는 PostService가 판단 |
| 이벤트 발행 | `TransactionInterceptor` (커밋 완료 콜백) | 커밋 전 발행을 구조적으로 방지 |
| `EventEmitter2` 주입 | `TransactionInterceptor` | 커밋 완료 시점에 emit하므로 불가피한 의존성 — 범용 인터셉터의 유일한 검색 의존성 |

`req.pendingSearchEvents: PostSyncEvent[]` — TransactionInterceptor `intercept()` 진입 시 빈 배열로 초기화, 요청 범위 유지.

---

## 3. OpenSearch 인덱스 설계

### 인덱스 접근 방식

모든 쿼리는 `posts` alias를 통해 접근한다. 실제 인덱스 이름은 `posts_v1`, `posts_v2` 형태로 버전 관리하며, 매핑 변경 시 alias 교체(blue/green)로 무중단 전환한다.

**alias 전환 절차**:
1. `posts_v2` 신규 인덱스 생성 (신규 매핑)
2. 쓰기를 `posts_v1` + `posts_v2` 양쪽 동시 적용 (dual-write 기간)
3. `posts_v1` → `posts_v2` 전체 reindex
4. alias `posts` 를 `posts_v2`로 교체 (원자적 교체)
5. dual-write 종료 후 `posts_v1` 삭제

### 인덱스명: `posts_v1`

```json
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "refresh_interval": "1s",
    "analysis": {
      "tokenizer": {
        "nori_mixed": {
          "type": "nori_tokenizer",
          "decompound_mode": "mixed"
        },
        "edge_ngram_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 1,
          "max_gram": 20,
          "token_chars": ["letter", "digit"]
        }
      },
      "filter": {
        "nori_posfilter": {
          "type": "nori_part_of_speech",
          "stoptags": ["E", "IC", "J", "MAG", "MM", "SP", "SSC", "SSO", "SC", "SE", "XPN", "XSA", "XSN", "XSV", "UNA", "NA", "VSV"]
        }
      },
      "analyzer": {
        "korean_index": {
          "type": "custom",
          "tokenizer": "nori_mixed",
          "filter": ["nori_posfilter", "lowercase", "nori_readingform"]
        },
        "korean_search": {
          "type": "custom",
          "tokenizer": "nori_mixed",
          "filter": ["nori_posfilter", "lowercase", "nori_readingform"]
        },
        "autocomplete_index": {
          "type": "custom",
          "tokenizer": "edge_ngram_tokenizer",
          "filter": ["lowercase"]
        },
        "autocomplete_search": {
          "type": "custom",
          "tokenizer": "nori_mixed",
          "filter": ["nori_posfilter", "lowercase"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "post_id":    { "type": "keyword" },
      "user_id":    { "type": "keyword" },
      "title": {
        "type": "text",
        "analyzer": "korean_index",
        "search_analyzer": "korean_search",
        "fields": {
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete_index",
            "search_analyzer": "autocomplete_search"
          }
        }
      },
      "summary": {
        "type": "text",
        "analyzer": "korean_index",
        "search_analyzer": "korean_search"
      },
      "tags":       { "type": "keyword" },
      "thumbnail":  { "type": "keyword", "index": false },
      "visibility": { "type": "boolean" },
      "status":     { "type": "keyword" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" }
    }
  }
}
```

**설계 결정**

| 항목 | 결정 | 이유 |
|------|------|------|
| `content` | 제외 | 인덱스 크기 급증 + 포스트 생성 지연 |
| `autocomplete_search` | `nori_mixed` | standard tokenizer는 한국어 단일 문자 처리 — 자동완성 미작동 |
| `nori_readingform` | index/search 대칭 | 한자 입력 시 미매칭 방지 |
| 검색 정렬 | `_score DESC, created_at DESC, post_id ASC` | 관련도 우선, 동점 시 최신순 tie-break, 결정론적 페이지네이션 |
| `post_id` 정렬 | keyword (lexicographic) | PostgreSQL UUID v4 사용 — 알파벳순 정렬로 `_score` + `created_at` 동점 시 결정론적 순서 보장. ULID/숫자 PK 변경 시 재검토 필요 |

---

## 4. API 설계

### AdminGuard 검증 조건

기존 코드베이스의 `AdminGuard` 사용:
- `AccessTokenGuard` 상속 — JWT 검증
- `request.user.role === UserRole.ADMIN` 체크

### OptionalAccessTokenGuard 동작

- Authorization 헤더 없음 → 통과 (`request.user = undefined`)
- Authorization 헤더 있음 → 토큰 검증, 실패 시 401

### 공통 에러 응답

| 상황 | HTTP | 메시지 |
|------|------|--------|
| `q` 미전달·빈 문자열 | 400 | "검색어를 입력해주세요." |
| `q` 100자 초과 또는 허용 문자 위반 | 400 | "올바르지 않은 검색어입니다." |
| `after` 파라미터 파싱 실패 (Base64 디코딩 실패 또는 JSON 역직렬화 실패 모두 포함) | 400 | "잘못된 커서 값입니다." |
| OpenSearch 장애 | 503 | "검색 서비스를 일시적으로 사용할 수 없습니다." |
| Rate Limit 초과 | 429 | "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." |
| reindex 이미 실행 중 | 409 | "이미 재색인이 진행 중입니다." |

- 409 감지 메커니즘: `SET reindex:running 1 NX EX 7200` 결과가 `null`이면 409 반환 (Redis 기반 분산 락)
- 429 응답 헤더: `@nestjs/throttler` v5 기준 `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` 포함. Nginx가 먼저 응답하는 경우 `Retry-After` 헤더 포함.

### Rate Limiting

```
GET /posts/search/suggest   비인증 30 req/min per IP, 인증 60 req/min per user
GET /posts/search           비인증 20 req/min per IP, 인증 60 req/min per user
```

임계값은 `@nestjs/throttler` 설정값(`ttl`, `limit`)으로 관리하며 `X-RateLimit-Limit` 헤더에 동적으로 노출된다. Nginx와 NestJS 두 레이어가 모두 적용되며, Nginx가 먼저 초과하면 `Retry-After` 헤더, NestJS가 초과하면 `X-RateLimit-*` 헤더가 반환된다.

### q 파라미터 공통 검증

```typescript
@IsString()
@MinLength(1, { message: '검색어를 입력해주세요.' })
@MaxLength(100, { message: '올바르지 않은 검색어입니다.' })
@Matches(/^[^\x00-\x1F\x7F<>{}()|\\^`"]+$/, { message: '올바르지 않은 검색어입니다.' })
q: string;
```

- 허용 문자: 한국어, 영문, 숫자, 공백, 일반 구두점
- 제외: 제어문자(0x00-0x1F, 0x7F), Lucene 특수 연산자
- OpenSearch 쿼리 타입: `simple_query_string` (`flags: PHRASE|PREFIX` 한정)

---

### 4-1. 자동완성

```
GET /posts/search/suggest?q={keyword}[&userId={userId}]
@UseGuards(OptionalAccessTokenGuard)
@UseThrottler({ limit: 30, ttl: 60 })
```

- `visibility: true AND status: published` 필터 필수 적용
- Redis 캐시 키: `suggest:${encodeURIComponent(q.toLowerCase().trim())}${userId ? `:${userId}` : ''}` (`:` 충돌 방지)
- Redis 장애 시 OpenSearch 직접 조회 (degraded mode)

**응답 반환 필드**

```json
{
  "posts": [
    { "id": "uuid", "title": "NestJS 인터셉터 패턴", "userId": "johndoe" }
  ],
  "tags": [
    { "name": "nestjs" }
  ]
}
```

- 포스트: `id`, `title`, `userId` 3개 필드만 반환 (최소 노출 원칙, userId는 클릭 시 블로그 경로 `/@{userId}/{postPath}` 구성에 필요)
- 태그: `name` 필드만 반환
- 포스트 최대 5개, 태그 최대 3개

---

### 4-2. 검색 실행

```
GET /posts/search?q={keyword}&after={cursor}&take={10}[&userId={userId}]
@UseGuards(OptionalAccessTokenGuard)
@UseThrottler({ limit: 20, ttl: 60 })
```

- `take` 최대값: 20 (`@Max(20)`)
- `visibility: true AND status: published` 필터 필수 적용
- 정렬: `_score DESC, created_at DESC, post_id ASC`

**커서 구조**

```typescript
// after 파라미터: JSON → Base64url 인코딩
interface SearchCursor {
  score: number;
  created_at: number;  // Unix timestamp (ms)
  post_id: string;
}
// OpenSearch search_after: [score, created_at_ms, post_id]
// 파싱 실패(Base64 디코딩 실패, JSON 역직렬화 실패, 숫자 변환 실패) 모두 400
```

**응답**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "NestJS 인터셉터 패턴",
      "summary": "...",
      "thumbnail": "https://...",
      "userId": "johndoe",
      "tags": ["nestjs", "backend"],
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "hasNext": true,
  "cursor": { "after": "eyJzY29yZSI6..." },
  "count": 42,
  "relatedTags": ["nestjs", "typescript", "backend"]
}
```

- `relatedTags`: `after` 미전달 (첫 페이지)에만 포함, 이후 `null`
- OpenSearch `terms aggregation` (size: 5, shard_size: 20)

---

### 4-3. reindex (관리자 전용)

```
POST /admin/search/reindex
@UseGuards(AdminGuard)
```

- 비동기: 즉시 `202 Accepted + { jobId: "uuid" }` 반환, BullMQ 백그라운드 처리
- 409: `SET reindex:running ... NX` 결과 `null` 시 — 분산 환경에서 유효
- 진행률 조회: `GET /admin/search/reindex/:jobId @UseGuards(AdminGuard)`
- 감사 로그: PostgreSQL `search_reindex_audit` 테이블에 기록

```sql
-- search_reindex_audit 테이블
CREATE TABLE search_reindex_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     VARCHAR NOT NULL,
  triggered_by  VARCHAR NOT NULL DEFAULT 'system',  -- 요청자 userId, 스케줄러 자동 실행 시 'system'
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  total_count   INT,
  success_count INT,
  failure_count INT,
  status     VARCHAR NOT NULL DEFAULT 'running'  -- running | completed | failed
);
```

---

## 5. 검색 히스토리 (프론트엔드 전담)

```
키: "search_history"
값: 최대 10개, 최신 순
```

- 저장 전 q 파라미터와 동일한 정규식으로 클라이언트 검증
- 렌더링 시 React 기본 텍스트 바인딩 사용 (`innerHTML` 금지)
- 중복 시 기존 항목 제거 후 앞에 추가, 10개 초과 시 가장 오래된 항목 제거

> DOMPurify는 브라우저 DOM 의존 라이브러리로 서버 사이드에서 사용하지 않는다.

---

## 6. 데이터 동기화

### 핵심 원칙

1. **이벤트 등록**: `PostService`가 `req.pendingSearchEvents` 배열에 이벤트 추가 (발행 안 함)
2. **이벤트 발행**: `TransactionInterceptor`가 커밋 완료 후 `pendingSearchEvents` 순회하여 emit
3. **비동기 처리**: `SearchSyncHandler`가 OpenSearch 색인 수행
4. **DLQ**: PostgreSQL 기반 — Redis 장애와 무관하게 실패 기록 보존

### req.pendingSearchEvents 생명주기

```typescript
// TransactionInterceptor.intercept() 시작 시
req.pendingSearchEvents = [];

// PostService 내부
req.pendingSearchEvents.push({ postId, operation, payload });

// TransactionInterceptor — 커밋 완료 직후
// @OnEvent 핸들러는 async이므로 emitAsync 사용 — sync emit은 async 예외를 catch 못 함
await qr.commitTransaction();
for (const event of req.pendingSearchEvents) {
  try {
    await this.eventEmitter.emitAsync('post.sync', event);
  } catch (e) {
    // 개별 이벤트 실패 시 로그 후 계속 진행 — 부분 누락은 주간 reindex로 보정
    this.logger.error('search sync event emit failed', { event, error: e });
  }
}

// TypeScript 타입 확장: src/types/express.d.ts
// (tsconfig.json의 include에 "src/types/**/*.d.ts" 추가 필요)
declare namespace Express {
  interface Request { pendingSearchEvents: PostSyncEvent[]; }
}
```

### 시나리오별 동기화

| 시나리오 | OpenSearch |
|----------|-----------|
| 포스트 생성 (공개, published) | `indexPost()` |
| 포스트 생성 (비공개 or draft) | 이벤트 등록 안 함 |
| 공개 → 비공개 | `removePost()` |
| 비공개 → 공개 | `indexPost()` |
| draft → published | `indexPost()` |
| published → draft | `removePost()` |
| 포스트 수정 (공개, published) | `updatePost()` |
| 포스트 삭제 (soft) | `removePost()` |

### 실패 처리

1. **인라인 재시도**: SearchSyncHandler에서 BullMQ 재시도 잡 등록 (5회, exponential backoff)
2. **DLQ**: 5회 실패 후 PostgreSQL `search_sync_failures` 테이블에 기록 — Redis 장애 시에도 보존

```sql
CREATE TABLE search_sync_failures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL,
  operation  VARCHAR NOT NULL,        -- index | update | remove
  payload    JSONB,
  error      TEXT,
  status     VARCHAR NOT NULL DEFAULT 'pending',  -- pending | resolved
  retry_count INT NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**재처리 생명주기**: 주간 reindex 잡이 완료되면 해당 reindex 시점 이전에 기록된 `pending` 레코드를 `resolved`로 일괄 업데이트 (`resolved_at = now()`). DLQ는 영구 보관 로그 역할이며 별도 재처리 잡은 없다. 개별 재처리가 필요하면 관리자가 수동으로 `POST /admin/search/reindex`를 트리거한다.

3. **방어선**: 검색 쿼리에 `visibility: true AND status: published` 필터 항상 적용

### reindex 잡 상세

- **분산 락**: `SET reindex:running {token} NX EX 7200`, 잡 완료/실패 `finally` 블록에서 Lua 스크립트로 토큰 일치 확인 후 삭제 (다른 프로세스의 락을 삭제하는 race condition 방지)
  ```lua
  -- Lua script (원자적 비교-삭제)
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else return 0 end
  ```
  - TTL 7200s: 포스트 10만건 기준 예상 최대 소요 2시간 (SeaweedFS concurrency 10 기준). 그 이전에 finally DEL로 해제됨
- **배치**: 포스트 500건 커서 페이지네이션 → SeaweedFS 병렬 조회 (concurrency 10) → OpenSearch 벌크 500건
- **SeaweedFS 실패**: 개별 파일 조회 실패 시 해당 post_id를 `search_sync_failures`에 기록, 배치 계속 진행
- **벌크 부분 실패**: OpenSearch `errors: true` 응답 시 실패 문서 ID만 `search_sync_failures`에 기록, 배치 재시도 최대 3회 (실패 문서만)
- **인덱싱 대상**: `visibility: true AND status: published AND deletedAt IS NULL`

---

## 7. 신규 모듈 구성

```
src/
  search/
    search.module.ts
    search.controller.ts         # GET /posts/search, GET /posts/search/suggest
    search.service.ts            # OpenSearch 쿼리, Redis 캐시
    search-sync.handler.ts       # @OnEvent('post.sync')
    search-sync.processor.ts     # BullMQ Worker
    dto/
      search-query.dto.ts        # q, after, take(@Max 20), userId
      suggest-query.dto.ts       # q, userId
  admin/
    search-reindex.controller.ts # POST + GET /admin/search/reindex
```

**의존성**

```
@opensearch-project/opensearch
@nestjs/event-emitter
@nestjs/bull + bull
ioredis
opossum
```

---

## 8. 인프라

### 개발 환경 (docker-compose.yml)

```yaml
opensearch:
  image: opensearchproject/opensearch:2.13.0
  environment:
    - discovery.type=single-node
    - DISABLE_SECURITY_PLUGIN=true      # 컨테이너 런타임 플러그인 비활성화
    - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
    interval: 30s
    retries: 5

redis:
  image: redis:7-alpine
```

환경변수:
```
OPENSEARCH_URL=http://opensearch:9200
OPENSEARCH_SECURITY_DISABLED=true   # 앱 레벨 검증용 — 개발 전용
```

### 운영 환경 (docker-compose.prod.yml)

- `DISABLE_SECURITY_PLUGIN` 및 `OPENSEARCH_SECURITY_DISABLED` 제거
- TLS 인증서 + 관리자 계정 초기화
- 9200 포트 내부 네트워크 전용
- 3-node 클러스터 권장 (`number_of_replicas: 1`)
- 단일 노드 불가피 시 S3/SeaweedFS 스냅샷 정책 필수
- JVM 힙: `-Xms2g -Xmx2g`, 호스트 메모리 4GB 이상

### 애플리케이션 시작 시 환경 검증

```typescript
if (process.env.NODE_ENV === 'production' &&
    process.env.OPENSEARCH_SECURITY_DISABLED === 'true') {
  throw new Error('[SECURITY] 운영 환경에서 OPENSEARCH_SECURITY_DISABLED를 활성화할 수 없습니다.');
}
```

### 서킷브레이커

**적용 대상**: OpenSearch 호출 단위에만 적용. Redis 장애는 별도 fallback 로직(probe 기반 degraded mode)으로 처리하며 opossum 범위 밖이다.

```typescript
// OpenSearch 호출만 래핑 — Redis 레이어와 무관
const breaker = new CircuitBreaker(opensearchCall, {
  timeout: 3000,
  volumeThreshold: 5,              // 최소 5회 요청 후 비율 계산
  errorThresholdPercentage: 50,    // 50% 이상 실패 시 OPEN
  resetTimeout: 30000,
});
breaker.fallback(() => {
  throw new ServiceUnavailableException('검색 서비스를 일시적으로 사용할 수 없습니다.');
});
```

**suggest 경로별 처리 매트릭스**

| Redis 상태 | OpenSearch CB 상태 | 처리 |
|----------|-----------------|------|
| NORMAL (HIT) | any | Redis 캐시 즉시 반환 |
| NORMAL (MISS) | CLOSED | OpenSearch 조회 → Redis 저장 → 반환 |
| NORMAL (MISS) | OPEN | 503 반환 |
| DEGRADED | CLOSED | OpenSearch 직접 조회 → 반환 (캐시 스킵) |
| DEGRADED | OPEN | 503 반환 |

---

## 9. 구현 순서

| 단계 | 내용 |
|------|------|
| 1 | Docker Compose OpenSearch + Redis 추가, `posts_v1` 인덱스 생성 스크립트 |
| 2 | `SearchModule` Custom Provider 등록 (`@opensearch-project/opensearch`) |
| 3 | BullMQ + EventEmitter2 설정, `SearchSyncHandler` / `SearchSyncProcessor` 구현 |
| 4 | `TransactionInterceptor` 커밋 후 `pendingSearchEvents` emit 추가 |
| 5 | `POST /admin/search/reindex` 비동기 잡 + `search_reindex_audit` 테이블 |
| 6 | `GET /posts/search/suggest` + Redis 캐시 |
| 7 | `GET /posts/search` + terms aggregation |
| 8 | 주간 reindex `@Cron` 스케줄러 |
| 9 | 서킷브레이커, Rate Limiting, 에러 핸들러 |
| 10 | 프론트엔드 localStorage 히스토리 연동 |

---

## 10. 잔존 미결 사항

| 항목 | 내용 | 결정 시점 |
|------|------|----------|
| 운영 OpenSearch 호스팅 | 자체 3-node Docker vs AWS OpenSearch Service | 배포 전 |
| Outbox 패턴 전환 | 베스트 에포트 → 완전 보장 필요 시점 | 서비스 성장 후 |
| 검색 관련도 가중치 튜닝 | title/summary/tags의 boost 비율 | 운영 데이터 축적 후 |
