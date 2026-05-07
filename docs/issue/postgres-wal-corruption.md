# PostgreSQL WAL 손상으로 인한 컨테이너 재기동 루프

## 요약

PostgreSQL 컨테이너가 기동 직후 PANIC으로 죽고 무한 재시작 루프에 빠짐. WAL(Write-Ahead Log)의 primary checkpoint 레코드가 손상되어 startup process가 복구를 완료하지 못함. NestJS 백엔드는 `the database system is starting up` 에러를 반복 출력하며 DB 연결 실패.

## 환경

- OS: Windows 11 Pro
- Docker: Docker Desktop (WSL2 백엔드)
- PostgreSQL: 15.13 (Debian 15.13-1.pgdg120+1)
- 백엔드: NestJS v11 + TypeORM v0.3 (`synchronize: true`)
- compose 위치: [backend/docker-compose.yml](../../docker-compose.yml)

## 증상

### 백엔드 로그

```
[Nest] ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...
error: the database system is starting up
    at Parser.parseErrorMessage (.../pg-protocol/src/parser.ts:369:69)
    ...
```

### PostgreSQL 컨테이너 로그 (반복)

```
LOG:  starting PostgreSQL 15.13 ...
LOG:  database system was interrupted; last known up at 2026-05-01 07:51:57 UTC
LOG:  invalid resource manager ID in primary checkpoint record
PANIC:  could not locate a valid checkpoint record
LOG:  startup process (PID 29) was terminated by signal 6: Aborted
LOG:  aborting startup due to startup process failure
LOG:  database system is shut down
```

10여 초 간격으로 startup → PANIC → shutdown 사이클이 무한 반복됨.

## 발생 시점

- 마지막 정상 가동: 2026-05-01 07:51:57 UTC (16:51 KST)
- 장애 인지: 2026-05-01 12:39 UTC (21:39 KST)
- 정상 종료(`docker compose down`) 없이 약 5시간 전 호스트가 비정상 종료된 것으로 추정 (절전·강제 종료·Docker Desktop 비정상 종료 등)

## 영향

- 로컬 개발 환경의 PostgreSQL 컨테이너 사용 불가
- 백엔드 API 전체 기동 실패 (DB 연결 실패로 NestJS 부트 중단)
- 데이터베이스 데이터 일부 또는 전체 유실 가능성

## 근본 원인

### 직접 원인: WAL checkpoint 레코드 손상

PostgreSQL은 트랜잭션을 먼저 WAL에 기록(`fsync`) 후 데이터 파일에 반영하는 구조다. fsync 호출이 OS·하이퍼바이저·파일시스템 어딘가에서 실제 디스크 도달 전에 잘리면, 재기동 시 startup process가 일관성 있는 checkpoint 레코드를 찾지 못해 PANIC으로 종료된다.

### 본질적 원인: Windows 호스트 bind mount

기존 [backend/docker-compose.yml](../../docker-compose.yml) 설정:

```yaml
volumes:
  - ./postgres-data:/var/lib/postgresql/data
```

호스트(Windows NTFS) 경로를 직접 bind mount하면 WSL2 → Windows 파일시스템 경유로 I/O가 흐르며, fsync 보장이 깨질 수 있다. 호스트가 절전·하이버네이션·강제 종료될 때 컨테이너 내부의 PostgreSQL은 fsync 성공으로 인지했지만 실제로는 디스크에 내려가지 않은 데이터가 발생하여 WAL이 잘린 상태로 남는다.

### 트리거 (추정)

- Docker Desktop 비정상 종료 또는 WSL2 freeze
- 노트북 절전·하이버네이션 진입
- 호스트 강제 종료 / 정전 / Windows 자동 재시작

## 해결

### 1. 손상된 데이터 디렉토리 제거 후 재기동

개발 환경이며 `synchronize: true`로 스키마가 자동 재생성되므로 데이터를 버리는 방식 채택.

```bash
cd c:/dev/dev.log/backend
docker compose down
rm -rf postgres-data
docker compose up -d
```

### 2. Bind mount → Named volume 교체 (재발 방지)

[backend/docker-compose.yml](../../docker-compose.yml), [docker-compose.yml](../../../docker-compose.yml) 두 파일 모두 named volume으로 변경.

```yaml
services:
  postgres:
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

Named volume은 WSL2의 ext4 영역에 저장되어 fsync가 정상 동작한다.

## 재발 방지

- 작업 종료 시 반드시 `docker compose down`으로 정상 종료
- Docker Desktop을 X 버튼으로 닫지 말고 `docker compose down` 후 종료
- 노트북 절전·하이버네이션 진입 전 컨테이너 stop
- Windows 업데이트 자동 재시작 설정 검토 (활성 시간 설정)
- 운영 환경에서는 정기 백업(`pg_dump`) 스케줄 도입 검토

## 관련 문서

- 트러블슈팅 절차: [docs/troubleshooting/postgres-wal-corruption.md](../troubleshooting/postgres-wal-corruption.md)
