import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './guard/admin.guard';
import { UserModel } from '../auth/entity/user.entity';
import { PostModel } from '../post/entity/post.entity';
import { CommentModel } from '../comment/entity/comment.entity';
import { PostLikeModel } from '../post/entity/post_like.entity';
import { AuthModule } from '../auth/auth.module';
import { SearchReindexController } from './search-reindex.controller';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserModel,
      PostModel,
      CommentModel,
      PostLikeModel,
    ]),
    AuthModule,
    SearchModule,
  ],
  controllers: [AdminController, SearchReindexController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
