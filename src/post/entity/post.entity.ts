import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserModel } from '../../auth/entity/user.entity';
import { PostLikeModel } from './post_like.entity';
import { CommentModel } from '../../comment/entity/comment.entity';
import { TagModel } from '../../tag/entity/tag.entity';
import { SeriesModel } from '../../series/entity/series.entity';

@Entity()
@Unique(['user_id', 'path'])
export class PostModel {
  // 게시글 식별자
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ comment: '작성자' })
  user_id: string;

  @ManyToOne(() => UserModel, (user) => user.posts)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: UserModel;

  @OneToMany(() => PostLikeModel, (like) => like.post)
  likes: PostLikeModel[];

  @OneToMany(() => CommentModel, (comment) => comment.post)
  comments: CommentModel[];

  @Column({ comment: '경로' })
  path: string;

  @Column({ type: 'varchar', length: 40, comment: '제목' })
  title: string;

  @Column({ type: 'varchar', length: 100, comment: '요약' })
  summary: string;

  @Column({ comment: '내용' })
  content: string;

  @Column({ comment: '썸네일' })
  thumbnail: string;

  @Column({ comment: '상태' })
  status: string; // enum

  @Column({ type: 'boolean', default: true, comment: '공개여부' })
  visibility: boolean;

  @Column({ type: 'varchar', nullable: true, comment: '시리즈 ID' })
  series_id: string | null;

  @ManyToOne(() => SeriesModel, (series) => series.posts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'series_id' })
  series: SeriesModel | null;

  @Column({ type: 'int', nullable: true, comment: '시리즈 내 순서' })
  series_order: number | null;

  @ManyToMany(() => TagModel, (tag) => tag.posts, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'post_tags',
    joinColumn: { name: 'post_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: TagModel[];

  @CreateDateColumn({ comment: '작성일자' })
  created_at: Date;

  @UpdateDateColumn({ comment: '수정일자' })
  updated_at: Date;

  @DeleteDateColumn({ comment: '삭제일자' })
  deleted_at: Date;
}
