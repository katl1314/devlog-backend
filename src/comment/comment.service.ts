import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, IsNull, QueryRunner, Repository } from 'typeorm';
import { CommentModel } from './entity/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { isEmpty } from '../common/util/util';

/** 허용되는 최대 댓글 레벨 (1~3) */
const MAX_LEVEL = 3;

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(CommentModel)
    private readonly commentRepository: Repository<CommentModel>,
  ) {}

  /**
   * QueryRunner 유무에 따라 적절한 Repository를 반환한다.
   * 트랜잭션 내에서 호출 시 qr을 전달해야 동일 트랜잭션에서 동작한다.
   */
  getRepository(qr?: QueryRunner) {
    return isEmpty(qr)
      ? this.commentRepository
      : qr.manager.getRepository(CommentModel);
  }

  /**
   * 포스트의 댓글 목록을 트리 구조로 반환한다.
   *
   * 루트 댓글(parent_id = null)을 먼저 조회한 뒤,
   * 각 댓글에 자식 댓글을 재귀적으로 붙여 최대 MAX_LEVEL 깊이까지 구성한다.
   *
   * @param postId 댓글을 조회할 포스트 ID
   * @returns 트리 구조의 댓글 배열
   */
  async getComments(postId: string) {
    const roots = await this.commentRepository.find({
      where: { post_id: postId, parent_id: IsNull() },
      relations: { user: true },
      order: { created_at: 'ASC' },
    });

    return Promise.all(roots.map((root) => this.attachChildren(root, 1)));
  }

  /**
   * 댓글에 자식 댓글을 재귀적으로 붙인다.
   *
   * currentLevel이 MAX_LEVEL에 도달하면 더 이상 자식을 조회하지 않고
   * children을 빈 배열로 설정한 뒤 반환한다.
   *
   * @param comment      자식을 붙일 대상 댓글
   * @param currentLevel 현재 댓글의 레벨
   */
  private async attachChildren(
    comment: CommentModel,
    currentLevel: number,
  ): Promise<CommentModel> {
    // 최대 레벨에 도달하면 자식 조회 중단
    if (currentLevel >= MAX_LEVEL) {
      comment.children = [];
      return comment;
    }

    const children = await this.commentRepository.find({
      where: { parent_id: Equal(comment.id) },
      relations: { user: true },
      order: { created_at: 'ASC' },
    });

    // 각 자식에도 재귀적으로 자식을 붙인다
    comment.children = await Promise.all(
      children.map((child) => this.attachChildren(child, currentLevel + 1)),
    );

    return comment;
  }

  /**
   * 댓글 또는 대댓글을 생성한다.
   *
   * parent_id가 없으면 루트 댓글(level=1)로 생성한다.
   * parent_id가 있으면 부모 댓글을 조회해 유효성을 검증한 뒤
   * level = parent.level + 1 로 생성한다.
   *
   * 검증 항목:
   * - 부모 댓글 존재 여부
   * - 부모 댓글이 동일 포스트에 속하는지
   * - 부모 댓글 레벨이 MAX_LEVEL 미만인지
   *
   * @param postId 댓글을 작성할 포스트 ID
   * @param userId 작성자 ID
   * @param dto    댓글 생성 데이터 (content, parent_id?)
   * @param qr     트랜잭션 QueryRunner (선택)
   */
  async createComment(
    postId: string,
    userId: string,
    dto: CreateCommentDto,
    qr?: QueryRunner,
  ) {
    const repo = this.getRepository(qr);

    let level = 1;

    if (dto.parent_id) {
      const parent = await this.commentRepository.findOne({
        where: { id: Equal(dto.parent_id) },
      });

      if (!parent) throw new NotFoundException('부모 댓글을 찾을 수 없습니다.');

      // 다른 포스트의 댓글에 대댓글을 다는 것을 방지
      if (parent.post_id !== postId)
        throw new ForbiddenException('포스트가 일치하지 않습니다.');

      // 최대 레벨 초과 방지
      if (parent.level >= MAX_LEVEL)
        throw new ForbiddenException(`최대 ${MAX_LEVEL}레벨까지만 허용됩니다.`);

      level = parent.level + 1;
    }

    const comment = repo.create({
      post_id: postId,
      user_id: userId,
      content: dto.content,
      parent_id: dto.parent_id ?? null,
      level,
    });

    return await repo.save(comment);
  }

  /**
   * 댓글을 soft delete 방식으로 삭제한다.
   *
   * 본인 댓글만 삭제할 수 있다.
   * soft delete이므로 자식 댓글은 유지되며,
   * DB에서 실제로 제거되지 않고 deleted_at이 기록된다.
   *
   * @param commentId 삭제할 댓글 UUID
   * @param userId    요청자 ID (본인 여부 검증용)
   * @returns 삭제된 댓글 ID
   */
  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await this.commentRepository.findOne({
      where: { id: Equal(commentId) },
    });

    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');
    if (comment.user_id !== userId)
      throw new ForbiddenException('본인 댓글만 수정할 수 있습니다.');

    comment.content = content;
    return await this.commentRepository.save(comment);
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.commentRepository.findOne({
      where: { id: Equal(commentId) },
    });

    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    // 본인 댓글인지 확인
    if (comment.user_id !== userId)
      throw new ForbiddenException('본인 댓글만 삭제할 수 있습니다.');

    await this.softDeleteWithChildren(commentId);
    return { id: commentId };
  }

  /**
   * 댓글과 모든 하위 댓글을 재귀적으로 soft delete한다.
   * 자식을 먼저 삭제한 뒤 부모를 삭제한다.
   */
  private async softDeleteWithChildren(commentId: string): Promise<void> {
    const children = await this.commentRepository.find({
      where: { parent_id: Equal(commentId) },
      select: ['id'],
    });

    for (const child of children) {
      await this.softDeleteWithChildren(child.id);
    }

    await this.commentRepository.softDelete({ id: commentId });
  }
}
