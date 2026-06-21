import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SearchSyncHandler } from './search-sync.handler';
import { PostSyncEvent } from '../types/express';
import { SEARCH_SYNC_QUEUE } from './search.service';

@Processor(SEARCH_SYNC_QUEUE)
export class SearchSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchSyncProcessor.name);

  constructor(
    private readonly handler: SearchSyncHandler,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<PostSyncEvent>) {
    try {
      await this.handler.process(job.data);
    } catch (e) {
      this.logger.error(
        `재시도 실패 (attempt ${job.attemptsMade}): postId=${job.data.postId}`,
        e,
      );

      if (job.attemptsMade >= 4) {
        await this.recordFailure(job.data, e as Error);
      }

      throw e;
    }
  }

  private async recordFailure(event: PostSyncEvent, error: Error) {
    try {
      await this.dataSource.query(
        `INSERT INTO search_sync_failures (post_id, operation, payload, error, retry_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [
          event.postId,
          event.operation,
          JSON.stringify(event.payload ?? {}),
          error.message,
          5,
        ],
      );
    } catch (dbErr) {
      this.logger.error('DLQ 기록 실패', dbErr);
    }
  }
}
