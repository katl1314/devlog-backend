import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { PostLikeModel } from '../../post/entity/post_like.entity';
import { CommentModel } from '../../comment/entity/comment.entity';
import { BlogModel } from '../../blog/entity/blog.entity';
import { PostModel } from '../../post/entity/post.entity';
import { UserFollowModel } from './user_follow.entity';
import { SeriesModel } from '../../series/entity/series.entity';

export enum ProviderEnum {
  email = 'EMAIL', // 이메일
  google = 'GOOGLE', // 구글
  github = 'GITHUB', // 깃헙
}

export enum StatusEnum {
  active = 'ACTIVE', // 활성
  blocked = 'BLOCKED', // 차단
  withdrawn = 'WITHDRAWN', // 탈퇴
}

@Entity()
export class UserModel {
  // 사용자 고유 식별자
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 이메일
  @Column({ nullable: false, unique: true })
  email: string;

  // 로그인 아이디
  @Column({ unique: true, length: 20 })
  user_id: string;

  // 프로필 이름
  @Column({ unique: true, length: 20 })
  user_name: string;

  // 프로필 이미지
  @Column()
  avatar_url: string;

  // 비밀번호 (이메일 로그인 전용, OAuth 사용자는 null)
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true, select: false })
  password: string | null;

  @Column({ type: 'enum', enum: StatusEnum, default: StatusEnum.active })
  status: StatusEnum;

  @Column({ enum: ProviderEnum, type: 'enum', default: ProviderEnum.email })
  provider: ProviderEnum;

  // 프로필 소개
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // 소셜 링크
  @Column({ type: 'jsonb', nullable: true })
  socials: {
    github?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    website?: string;
  } | null;

  @OneToOne(() => BlogModel, (blog) => blog.user, { onDelete: 'CASCADE' })
  blog: BlogModel;

  @OneToMany(() => PostModel, (post) => post.user)
  posts: PostModel[];

  @OneToMany(() => SeriesModel, (series) => series.user)
  series: SeriesModel[];

  @OneToMany(() => PostLikeModel, (like) => like.user)
  likes: PostLikeModel[];

  @OneToMany(() => CommentModel, (comment) => comment.user)
  comments: CommentModel[];

  @OneToMany(() => UserFollowModel, (follow) => follow.follower)
  following: UserFollowModel[];

  @OneToMany(() => UserFollowModel, (follow) => follow.following)
  followers: UserFollowModel[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
