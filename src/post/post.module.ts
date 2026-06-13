import { TagModel } from '../tag/entity/tag.entity';
import { PostController } from './post.controller';
import { PostModel } from './entity/post.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagModule } from '../tag/tag.module';
import { PostService } from './post.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { PostLikeModel } from './entity/post_like.entity';
import { UserFollowModel } from '../auth/entity/user_follow.entity';
import { UserModel } from '../auth/entity/user.entity';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PostModel,
      PostLikeModel,
      TagModel,
      UserFollowModel,
      UserModel,
    ]),
    AuthModule,
    TagModule,
    CommonModule,
    StorageModule,
  ],
  controllers: [PostController],
  providers: [PostService],
})
export class PostModule {}
