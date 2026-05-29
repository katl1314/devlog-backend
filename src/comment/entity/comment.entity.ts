import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserModel } from '../../auth/entity/user.entity';
import { PostModel } from '../../post/entity/post.entity';

/**
 * 댓글 엔티티
 *
 * 자기 참조(Self-referencing) 구조로 대댓글을 표현한다.
 * - 루트 댓글: parent_id = null, level = 1
 * - 대댓글:    parent_id = 부모 댓글 UUID, level = 부모.level + 1
 * - 최대 레벨: 3 (CommentService.MAX_LEVEL 에서 제어)
 *
 * 삭제는 soft delete(deleted_at)로 처리한다.
 */
@Entity()
export class CommentModel {
  /** 댓글 고유 식별자 (UUID) */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 댓글이 속한 포스트 ID */
  @Column()
  post_id: string;

  /** 댓글 작성자 ID */
  @Column()
  user_id: string;

  /** 댓글 본문 (최대 100자) */
  @IsString()
  @Length(1, 100)
  @Column({ type: 'varchar', length: 100 })
  content: string;

  /**
   * 댓글 깊이 레벨
   * - 1: 루트 댓글
   * - 2: 1레벨 댓글의 대댓글
   * - 3: 2레벨 댓글의 대댓글 (최대)
   */
  @Column({ type: 'int' })
  level: number;

  /**
   * 부모 댓글 ID
   * - 루트 댓글이면 null
   * - 대댓글이면 부모 CommentModel의 UUID
   */
  @IsOptional()
  @IsUUID()
  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  /**
   * 부모 댓글 관계
   * - 루트 댓글이면 null
   * - 부모 삭제 시 자식도 CASCADE 삭제
   */
  @ManyToOne(() => CommentModel, (comment) => comment.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: CommentModel | null;

  /** 자식 댓글 목록 (이 댓글을 부모로 하는 대댓글들) */
  @OneToMany(() => CommentModel, (comment) => comment.parent)
  children: CommentModel[];

  /** 작성자 정보 */
  @ManyToOne(() => UserModel, (user) => user.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserModel;

  /** 포스트 정보 */
  @ManyToOne(() => PostModel, (post) => post.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: PostModel;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /** soft delete 컬럼 — null이면 정상, 값이 있으면 삭제된 댓글 */
  @DeleteDateColumn()
  deleted_at: Date;
}
