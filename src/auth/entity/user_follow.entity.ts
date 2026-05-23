import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserModel } from './user.entity';

@Entity()
@Unique(['follower_id', 'following_id'])
export class UserFollowModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // UserModel.id (UUID) 저장 — PostLikeModel 패턴과 동일
  @Column()
  follower_id: string;

  @Column()
  following_id: string;

  @ManyToOne(() => UserModel, (user) => user.following, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'follower_id' })
  follower: UserModel;

  @ManyToOne(() => UserModel, (user) => user.followers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'following_id' })
  following: UserModel;

  @CreateDateColumn()
  created_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
