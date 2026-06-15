# 설계 보고서 — 에디터 이미지 업로드

> 작성일: 2026-06-14  
> 최종 수정: 2026-06-14

---

## 1. 현황 분석

| 항목 | 현재 상태 |
|------|----------|
| 스토리지 | SeaweedFS, `images` 버킷 정의됨 (미사용) |
| 스토리지 인터페이스 | `upload`, `get(text)`, `delete` — 바이너리 조회 없음 |
| 에디터 | TipTap, Image 확장 미설치 |
| 이미지 API | 없음 |
| 이미지 렌더링 | `next/image` 사용 필수 (`<img>` 사용 불가) |

---

## 2. 핵심 결정 사항

### 이미지 렌더링 방식

포스트 본문 이미지는 출처에 따라 렌더러에서 분기한다.

| 이미지 출처 | 렌더링 | 이유 |
|------------|--------|------|
| 우리 스토리지 (`/api/image/...`) | `next/image` | 최적화, 같은 도메인이므로 설정 불필요 |
| 외부 URL (`https://...`) | `<img>` | 도메인 무한하여 `next.config.js` 등록 불가 |

```tsx
// 마크다운 렌더러 커스텀 img 컴포넌트
img: ({ src, alt }) => {
  if (src?.startsWith('/api/image/')) {
    return <Image src={src} alt={alt ?? ''} width={800} height={600} />
  }
  return <img src={src} alt={alt ?? ''} />
}
```

### 이미지 URL 방식
`next/image` 는 외부 도메인 이미지 사용 시 `next.config.js` 도메인 등록이 필요하다.
이를 피하기 위해 **Next.js API Route를 프록시로 활용**, 이미지 URL을 프론트엔드 도메인 기준 상대 경로로 유지한다.

```
마크다운 저장 형식: ![alt](/api/image/{uuid}.{ext})
                              ↑ 프론트 도메인 기준 → next.config.js 설정 불필요
```

### 스토리지 키 방식
UUID 충돌을 원천 차단하기 위해 **DB에서 키를 생성**한다.

```
업로드 요청
  → ImageModel 레코드 DB INSERT
  ← TypeORM이 생성한 UUID (DB UNIQUE 제약으로 완전 보장)
  → SeaweedFS에 UUID로 저장
  → ImageModel 레코드 업데이트 (저장 완료 표시)
```

업로드 이력(누가, 언제, 어떤 파일)을 DB에서 관리한다.

---

## 3. ImageModel 엔티티 설계

```typescript
@Entity('image')
export class ImageModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;                        // 스토리지 키로 사용

  @Column()
  user_id: string;                   // 업로더

  @ManyToOne(() => UserModel)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: UserModel;

  @Column()
  original_name: string;             // 원본 파일명

  @Column()
  mime_type: string;                 // image/jpeg 등

  @Column()
  extension: string;                 // jpg, png 등

  @Column({ type: 'int' })
  size: number;                      // bytes

  @Column({ default: false })
  is_uploaded: boolean;              // 스토리지 저장 완료 여부

  @CreateDateColumn()
  created_at: Date;
}
```

스토리지 키: `{id}.{extension}` (예: `550e8400-e29b-41d4-a716-446655440000.jpg`)

---

## 4. 전체 흐름

### 업로드 흐름

```
에디터에서 이미지 선택
  → POST /api/image (Next.js Route Handler)
      세션 토큰 추출 후 백엔드로 중계
    → POST /image (NestJS)
        1. ImageModel INSERT → UUID 확보
        2. SeaweedFS images 버킷에 {uuid}.{ext} 키로 저장
        3. ImageModel is_uploaded = true 업데이트
    ← { url: '/image/{uuid}.{ext}' }
  ← { url: '/api/image/{uuid}.{ext}' }
→ 에디터에 ![alt](/api/image/{uuid}.{ext}) 삽입
→ 포스트 저장 시 마크다운 텍스트에 포함되어 SeaweedFS posts 버킷에 저장
```

### 조회 흐름

```
브라우저에서 <Image src="/api/image/{uuid}.{ext}" /> 요청
  → GET /api/image/{uuid}.{ext} (Next.js Route Handler)
    → GET /image/{uuid}.{ext} (NestJS)
        SeaweedFS images 버킷에서 바이너리 조회
    ← 이미지 바이너리 + Content-Type
  ← 이미지 바이너리 스트림 응답
→ next/image가 최적화 후 렌더링
```

---

## 5. API 설계

### Backend (NestJS)

```
POST /image
  - Auth: AccessTokenGuard (Bearer)
  - Body: multipart/form-data { image: File }
  - Response: { url: '/image/{uuid}.{ext}' }

GET /image/:key
  - Auth: 없음 (공개)
  - Response: 이미지 바이너리 (Content-Type: mime_type)
```

### Frontend (Next.js Route Handler)

```
POST /api/image
  - Auth: 세션 쿠키 기반 (NextAuth)
  - Body: multipart/form-data { image: File }
  - 역할: 세션 토큰 추출 → 백엔드 POST /image 중계
  - Response: { url: '/api/image/{uuid}.{ext}' }

GET /api/image/:key
  - Auth: 없음
  - 역할: 백엔드 GET /image/:key 중계 → 바이너리 스트림 응답
```

---

## 6. 변경 파일 목록

### Backend

| 파일 | 작업 | 내용 |
|------|------|------|
| `src/storage/storage.interface.ts` | 수정 | `getBuffer(bucket, key)` 메서드 추가 |
| `src/storage/local.storage.ts` | 수정 | `getBuffer` 구현 — S3 바이너리 조회 |
| `src/storage/prod.storage.ts` | 수정 | `getBuffer` stub 추가 |
| `src/image/entity/image.entity.ts` | 신규 | `ImageModel` 엔티티 |
| `src/image/image.service.ts` | 신규 | 업로드/조회 비즈니스 로직 |
| `src/image/image.controller.ts` | 신규 | `POST /image`, `GET /image/:key` |
| `src/image/image.module.ts` | 신규 | 모듈 정의 |
| `src/app.module.ts` | 수정 | `ImageModule` 등록, `ImageModel` 엔티티 추가 |
| `package.json` (devDeps) | 수정 | `@types/multer` 추가 |

### Frontend

| 파일 | 작업 | 내용 |
|------|------|------|
| `package.json` | 수정 | `@tiptap/extension-image` 추가 |
| `src/app/api/image/route.ts` | 신규 | POST — 백엔드 업로드 중계 |
| `src/app/api/image/[key]/route.ts` | 신규 | GET — 백엔드 바이너리 중계 |
| `src/components/editor/editor.tsx` | 수정 | Image 확장 추가, `onImageUpload` prop, 클립보드 paste 핸들러 |
| `src/components/editor/control-panel.tsx` | 수정 | 이미지 업로드 버튼 추가 |
| `src/app/write/components/post/post-editor.tsx` | 수정 | 업로드 핸들러 → Editor에 전달 |
| `src/components/markdown-renderer.tsx` | 수정 | 커스텀 `img` 컴포넌트 — `/api/image/`는 `next/image`, 외부 URL은 `<img>` |

---

## 7. 파일 제한 (multer 설정)

- 허용 타입: `image/*`
- 최대 크기: 10MB

---

## 8. 체크리스트

### Backend
- [ ] `StorageInterface.getBuffer` 추가
- [ ] `LocalStorage.getBuffer` 구현
- [ ] `ProdStorage.getBuffer` stub
- [ ] `ImageModel` 엔티티 구현
- [ ] `ImageService` 구현 (upload, getBuffer)
- [ ] `ImageController` 구현 (POST /image, GET /image/:key)
- [ ] `ImageModule` 생성
- [ ] `AppModule`에 `ImageModule` 등록, `ImageModel` 엔티티 추가
- [ ] `@types/multer` 설치

### Frontend
- [ ] `@tiptap/extension-image` 설치
- [ ] `POST /api/image` Route Handler 구현
- [ ] `GET /api/image/[key]` Route Handler 구현
- [ ] `Editor`에 Image 확장 + `onImageUpload` prop 추가
- [ ] `ControlPanel`에 이미지 업로드 버튼 추가
- [ ] `PostEditor`에서 핸들러 연결
