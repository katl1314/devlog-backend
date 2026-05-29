import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { TransactionInterceptor } from '../common/interceptor/transaction.interceptor';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';
import { QueryRunner } from 'typeorm';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UserModel } from '../auth/entity/user.entity';

/**
 * 댓글 API 컨트롤러.
 *
 * @remarks
 * Base URL: `/comment`
 *
 * [공개]
 * - `GET    /comment/:postId`      포스트 댓글 목록 조회 (트리 구조)
 *
 * [인증 필요]
 * - `POST   /comment/:postId`      댓글 또는 대댓글 작성
 * - `DELETE /comment/:commentId`   댓글 삭제 (본인만 가능)
 */
@Controller('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  /**
   * 포스트의 댓글 목록을 트리 구조로 반환한다.
   *
   * @remarks
   * 인증 없이 조회 가능하다.
   *
   * @param postId - 조회할 포스트 ID
   * @returns 트리 구조의 댓글 목록
   */
  @Get(':postId')
  getComments(@Param('postId') postId: string) {
    return this.commentService.getComments(postId);
  }

  /**
   * 댓글 또는 대댓글을 작성한다.
   *
   * @remarks
   * `dto.parent_id`가 없으면 루트 댓글, 있으면 대댓글로 생성된다.
   * 트랜잭션 내에서 처리된다.
   *
   * @param postId - 댓글을 작성할 포스트 ID
   * @param dto    - 댓글 내용 및 부모 댓글 ID
   * @param req    - 인증된 사용자 정보 및 `QueryRunner`
   * @returns 생성된 댓글
   */
  @Post(':postId')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(TransactionInterceptor)
  createComment(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: Request & { user: UserModel; qr: QueryRunner },
  ) {
    return this.commentService.createComment(postId, req.user.id, dto, req.qr);
  }

  /**
   * 댓글을 삭제한다 (soft delete).
   *
   * @remarks
   * 본인 댓글만 삭제할 수 있다.
   *
   * @param commentId - 삭제할 댓글 UUID
   * @param req       - 인증된 사용자 정보
   * @returns 삭제 처리 결과
   */
  @Delete(':commentId')
  @UseGuards(AccessTokenGuard)
  deleteComment(
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Req() req: Request & { user: UserModel },
  ) {
    return this.commentService.deleteComment(commentId, req.user.id);
  }
}
