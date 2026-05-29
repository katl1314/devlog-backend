import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserModel } from '../../auth/entity/user.entity';
import { PostModel } from './post.entity';

@Entity()
@Unique(['user_id', 'post_id'])
export class PostLikeModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  post_id: string;

  // 관계 설정
  @ManyToOne(() => UserModel, (user) => user.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserModel;

  @ManyToOne(() => PostModel, (post) => post.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: PostModel;

  @DeleteDateColumn()
  deleted_at: Date;
}
