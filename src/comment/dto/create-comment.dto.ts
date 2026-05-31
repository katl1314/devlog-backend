import { PickType } from '@nestjs/swagger';
import { CommentModel } from '../entity/comment.entity';

/**
 * 댓글 생성 DTO
 *
 * CommentModel에서 필요한 필드만 선택한다.
 * - content:   댓글 본문 (필수, 1~100자)
 * - parent_id: 부모 댓글 UUID (선택 — 없으면 루트 댓글, 있으면 대댓글)
 */
export class CreateCommentDto extends PickType(CommentModel, [
  'content',
  'parent_id',
]) {}
