import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan } from 'typeorm';
import { UserModel } from './entity/user.entity';
import { UserFollowModel } from './entity/user_follow.entity';
import { CommentModel } from '../comment/entity/comment.entity';
import { PostModel } from '../post/entity/post.entity';
import { PostLikeModel } from '../post/entity/post_like.entity';

@Injectable()
export class AccountCleanupCron implements OnApplicationBootstrap {
  private readonly BATCH_SIZE = 1000;
  private readonly RETENTION_DAYS = 7;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    await this.runHardDelete();
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Seoul' })
  async scheduled() {
    await this.runHardDelete();
  }

  private async runHardDelete() {
    const cutoff = new Date(
      Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    let hasMore = true;
    while (hasMore) {
      const users = await this.dataSource.getRepository(UserModel).find({
        where: { deleted_at: LessThan(cutoff) },
        take: this.BATCH_SIZE,
        select: ['id', 'user_id'],
      });

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      const userUuids = users.map((u) => u.id);
      const userStringIds = users.map((u) => u.user_id);

      await this.dataSource.transaction(async (manager) => {
        // PostLike hard delete
        await manager
          .getRepository(PostLikeModel)
          .createQueryBuilder()
          .delete()
          .where('user_id IN (:...ids)', { ids: userUuids })
          .execute();

        // UserFollow hard delete
        await manager
          .getRepository(UserFollowModel)
          .createQueryBuilder()
          .delete()
          .where('follower_id IN (:...ids) OR following_id IN (:...ids)', {
            ids: userUuids,
          })
          .execute();

        // Comment hard delete
        await manager
          .getRepository(CommentModel)
          .createQueryBuilder()
          .delete()
          .where('user_id IN (:...ids)', { ids: userUuids })
          .execute();

        // Post hard delete
        await manager
          .getRepository(PostModel)
          .createQueryBuilder()
          .delete()
          .where('user_id IN (:...userStringIds)', { userStringIds })
          .execute();

        // User hard delete
        await manager
          .getRepository(UserModel)
          .createQueryBuilder()
          .delete()
          .where('id IN (:...ids)', { ids: userUuids })
          .execute();
      });

      hasMore = users.length === this.BATCH_SIZE;
    }
  }
}
