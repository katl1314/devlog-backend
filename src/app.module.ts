import { CommentModel } from './comment/entity/comment.entity';
import { PostLikeModel } from './post/entity/post_like.entity';
import { CommentModule } from './comment/comment.module';
import { UserModel } from './auth/entity/user.entity';
import { UserSettingsModel } from './auth/entity/user_settings.entity';
import { BlogModel } from './blog/entity/blog.entity';
import { PostModel } from './post/entity/post.entity';
import { TagModel } from './tag/entity/tag.entity';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogModule } from './blog/blog.module';
import { PostModule } from './post/post.module';
import { ConfigModule } from '@nestjs/config';
import { TagModule } from './tag/tag.module';
import { AppService } from './app.service';
import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { UserFollowModel } from './auth/entity/user_follow.entity';
import { SeriesModel } from './series/entity/series.entity';
import { SeriesModule } from './series/series.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AdminModule } from './admin/admin.module';
import { ImageModule } from './image/image.module';
import { ImageModel } from './image/entity/image.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env.local',
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: 5432,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: [
        UserModel,
        UserSettingsModel,
        BlogModel,
        PostModel,
        CommentModel,
        PostLikeModel,
        TagModel,
        UserFollowModel,
        SeriesModel,
        ImageModel,
      ],
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: process.cwd() + '/public',
      serveRoot: '/admin-ui',
    }),
    AuthModule,
    BlogModule,
    PostModule,
    CommentModule,
    TagModule,
    SeriesModule,
    CommonModule,
    AdminModule,
    ImageModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
