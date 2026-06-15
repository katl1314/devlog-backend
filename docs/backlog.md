# 백로그

> 구현 보류 항목 모음. 우선순위 미정.

---

## MulterError 예외 처리 완료

- `MulterExceptionFilter` 구현 및 `ImageController.uploadImage`에 `@UseFilters` 적용
- 파일 크기 초과 시 400 + `파일 크기는 10MB를 초과할 수 없습니다.` 반환
- 프론트엔드 `handleImageUpload`에서 에러 메시지를 toast로 표시

---

## 이미지 업로드/다운로드 로그 수집

- **대상**: `ImageController` — `POST /image`, `GET /image/:key`
- **내용**: NestJS `Logger`를 사용해 요청별 로그 수집
  - 업로드: `user_id`, `original_name`, `size`, `mime_type`, 성공/실패 여부
  - 다운로드: `key`, 성공/실패 여부
- **배경**: 백엔드 기본 요건으로 실시간 추적 및 장애 대응에 필요
- **현재 상태**: `ImageModel` 테이블에 업로드 이력은 남지만 실시간 로그 없음
