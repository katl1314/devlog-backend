# OpenSearch 검색 기능 설정 트러블슈팅

## 문제 요약

포스트 타이틀 검색이 동작하지 않았던 원인과 해결 과정을 정리한다.

---

## 원인 1 — Nori 플러그인 미설치

### 증상

서버 시작 시 아래 경고 발생.

```
[SearchService] 인덱스 초기화 실패 (OpenSearch 미연결 상태일 수 있음):
Unknown tokenizer type [nori_tokenizer] for [nori_mixed]
```

### 원인

`opensearchproject/opensearch:2.13.0` 기본 이미지에는 한국어 형태소 분석 플러그인(`analysis-nori`)이 포함되어 있지 않다.
플러그인 없이 `nori_tokenizer`를 사용하는 인덱스를 생성하려 하면 400 에러가 발생하고, `posts_v1` 인덱스가 생성되지 않는다.

### 해결

`opensearch/Dockerfile`을 생성해 플러그인을 포함한 커스텀 이미지를 빌드한다.

**`opensearch/Dockerfile`**

```dockerfile
FROM opensearchproject/opensearch:2.13.0
RUN opensearch-plugin install analysis-nori
```

**`docker-compose.yml`**

```yaml
opensearch:
  build: ./opensearch   # image: ... 에서 변경
  environment:
    ...
```

**컨테이너 재빌드 및 재시작**

```bash
docker compose down opensearch
docker compose build opensearch
docker compose up -d opensearch
```

---

## 원인 2 — posts_v1 인덱스 미생성

### 증상

OpenSearch는 정상 기동됐지만 `posts_v1` 인덱스가 없는 상태.

```bash
docker exec local-devlog-opensearch-1 curl -s http://localhost:9200/_cat/indices
# posts_v1 없음
```

### 원인

Nori 플러그인 오류로 `ensureIndex()`가 실패한 채 서버가 떠 있었다.
Docker 재빌드 후에도 NestJS 서버를 재시작하지 않으면 `onModuleInit`이 다시 실행되지 않는다.

### 해결

NestJS 서버 재시작.

```bash
npm run start:dev
```

재시작 후 인덱스 생성 확인.

```bash
docker exec local-devlog-opensearch-1 curl -s http://localhost:9200/_cat/indices
# posts_v1 이 목록에 나타나면 정상
```

---

## 원인 3 — search_reindex_audit, search_sync_failures 테이블 미생성

### 증상

reindex 작업 실행 시 `state: failed`.

### 원인

`SearchReindexProcessor`에서 raw SQL로 `search_reindex_audit`, `search_sync_failures` 테이블에 접근하지만, 해당 테이블이 TypeORM 엔티티가 아니라 `synchronize: true`로 자동 생성되지 않는다.

### 해결

DB에서 직접 테이블 생성.

```bash
docker exec -it local-devlog-postgres-1 psql -U postgres -d devlog -c "
CREATE TABLE search_reindex_audit (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR NOT NULL,
  triggered_by VARCHAR NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  total_count INTEGER,
  success_count INTEGER,
  failure_count INTEGER,
  status VARCHAR NOT NULL
);

CREATE TABLE search_sync_failures (
  id SERIAL PRIMARY KEY,
  post_id UUID NOT NULL,
  operation VARCHAR NOT NULL,
  error TEXT,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP,
  CONSTRAINT search_sync_failures_post_id_operation_unique UNIQUE (post_id, operation)
);"
```

---

## reindex 실행 절차

기존 DB 포스트를 OpenSearch에 색인하는 작업. **최초 1회만 실행**하면 되며, 이후 포스트 생성/수정/삭제는 `post.sync` 이벤트로 자동 색인된다.

### 1. DB에서 ADMIN 역할 부여

```bash
docker exec -it local-devlog-postgres-1 psql -U postgres -d devlog
```

```sql
UPDATE "user" SET role = 'ADMIN' WHERE email = '이메일';
```

### 2. 액세스 토큰 발급

```bash
curl -X POST http://localhost:3001/auth/signIn/credentials \
  -H "Authorization: Basic $(echo -n '이메일:비밀번호' | base64)"
```

응답의 `accessToken` 복사.

### 3. reindex 실행

```bash
curl -X POST http://localhost:3001/admin/search/reindex \
  -H "Authorization: Bearer {accessToken}"
```

### 4. 작업 상태 확인

```bash
curl -X GET http://localhost:3001/admin/search/reindex/{jobId} \
  -H "Authorization: Bearer {accessToken}"
```

`state: completed`이면 완료.

---

## 주의사항

### Redis 락 잔류 문제

reindex 작업이 중간에 실패하면 Redis 락(`reindex:running`)이 남아 이후 요청에서 409 에러가 발생한다.

```
{"statusCode":409,"message":"이미 재색인이 진행 중입니다."}
```

락을 수동으로 제거한 뒤 재시도한다.

```bash
docker exec local-devlog-redis-1 redis-cli DEL reindex:running
```

### Windows에서 curl로 OpenSearch 직접 접근 불가

Windows(MINGW64)의 curl은 OpenSearch에 접근할 때 `Empty reply from server` 또는 SSL 오류가 발생한다.
컨테이너 내부에서 실행해야 한다.

```bash
docker exec local-devlog-opensearch-1 curl -s http://localhost:9200/_cat/indices
```
