# NestJS useClass에서 환경변수가 undefined로 평가되는 문제

## 문제 요약

`@Module` 데코레이터의 `providers` 배열에서 `useClass`에 환경변수 조건을 사용할 경우,
`ConfigModule.forRoot()`가 `.env` 파일을 로드하기 전에 조건이 평가되어 항상 `undefined`로 처리된다.

---

## 발생 맥락

`StorageModule`에서 환경변수 유무에 따라 구현체를 다르게 주입하려 했다.

```typescript
// storage.module.ts
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: process.env.SEAWEEDFS_ENDPOINT ? LocalStorage : ProdStorage,
    },
  ],
})
export class StorageModule {}
```

의도: `SEAWEEDFS_ENDPOINT`가 있으면 `LocalStorage`, 없으면 `ProdStorage` 사용.

실제 결과: 환경변수가 항상 `undefined`로 평가되어 `ProdStorage`만 사용됨.

---

## 원인: 모듈 평가 시점과 환경변수 로드 시점의 차이

### Node.js 모듈 시스템의 실행 순서

```
1. main.ts 실행
2. AppModule import 시작
   └─ PostModule import
      └─ StorageModule import
         └─ @Module 데코레이터 실행
            → process.env.SEAWEEDFS_ENDPOINT 평가 ← 이 시점에 .env 미로드
3. NestJS 부트스트랩 시작
   └─ ConfigModule.forRoot() 초기화
      → dotenv가 .env.local 파일 로드 (이미 늦음)
4. StorageModule 초기화
   └─ step 2에서 결정된 ProdStorage 사용
```

### 핵심

- `useClass`의 값(`process.env.X ? A : B`)은 **데코레이터가 평가되는 시점**, 즉 파일이 import될 때 즉시 실행된다.
- `ConfigModule.forRoot()`는 NestJS 부트스트랩 단계에서 초기화되므로 이보다 **늦게 실행**된다.
- 결과적으로 환경변수가 세팅되기 전에 조건이 평가되어 항상 `undefined`가 된다.

---

## 해결: useFactory 사용

`useFactory`의 함수 본문은 NestJS가 모듈을 초기화할 때 호출된다.
이 시점에는 `ConfigModule`이 이미 `.env` 파일을 로드한 후이므로 환경변수를 정상적으로 읽을 수 있다.

```typescript
// 수정 후
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: () =>
        process.env.SEAWEEDFS_ENDPOINT ? new LocalStorage() : new ProdStorage(),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
```

### useClass vs useFactory 평가 시점 비교

| 방식 | 환경변수 조건 평가 시점 | ConfigModule 로드 후 여부 |
|------|----------------------|--------------------------|
| `useClass: env ? A : B` | 파일 import 시 (데코레이터 실행) | 이전 (환경변수 없음) |
| `useFactory: () => env ? new A() : new B()` | NestJS 모듈 초기화 시 (팩토리 호출) | 이후 (환경변수 있음) |

---

## 파생 문제: OnModuleInit 미실행

이 타이밍 이슈로 인해 `LocalStorage`에 구현한 `OnModuleInit`도 실행되지 않는다.

- `ProdStorage`가 선택됨 → `OnModuleInit` 미구현 → 훅 호출 없음
- 증상: 서버 시작 시 버킷 생성 로직이 실행되지 않음

`useFactory`로 변경하면 올바른 구현체가 선택되어 `onModuleInit`도 정상 호출된다.

> NestJS는 `useClass`, `useFactory` 모두 `OnModuleInit` 구현 여부를 감지하고 호출한다.

---

## 동일 패턴이 발생할 수 있는 케이스

`@Module` 데코레이터 내부에서 환경변수로 조건 분기하는 모든 곳에서 동일하게 발생한다.

```typescript
// 위험한 패턴 — 전부 useFactory로 대체해야 함
useClass: process.env.NODE_ENV === 'production' ? ProdService : DevService
useClass: process.env.FEATURE_FLAG ? NewService : OldService
```

```typescript
// 안전한 패턴
useFactory: () =>
  process.env.NODE_ENV === 'production' ? new ProdService() : new DevService()
```

---

## 관련 파일

- [`src/storage/storage.module.ts`](../../src/storage/storage.module.ts)
- [`src/storage/local.storage.ts`](../../src/storage/local.storage.ts)
- [`src/app.module.ts`](../../src/app.module.ts)
