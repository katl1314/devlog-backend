import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserModel } from '../../auth/entity/user.entity';

@Entity('image')
export class ImageModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ comment: '업로더 user_id' })
  user_id: string;

  @ManyToOne(() => UserModel)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'user_id' })
  user: UserModel;

  @Column({ comment: '원본 파일명' })
  original_name: string;

  @Column({ comment: 'MIME 타입' })
  mime_type: string;

  @Column({ comment: '확장자' })
  extension: string;

  @Column({ type: 'int', comment: '파일 크기 (bytes)' })
  size: number;

  @Column({ default: false, comment: '스토리지 저장 완료 여부' })
  is_uploaded: boolean;

  @CreateDateColumn({ comment: '업로드 일시' })
  created_at: Date;
}
