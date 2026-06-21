import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SearchService, SEARCH_SYNC_QUEUE } from './search.service';
import { PostSyncEvent } from '../types/express';

@Injectable()
export class SearchSyncHandler {
  private readonly logger = new Logger(SearchSyncHandler.name);

  constructor(
    private readonly searchService: SearchService,
    @InjectQueue(SEARCH_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  @OnEvent('post.sync', { async: true })
  async handle(event: PostSyncEvent) {
    try {
      await this.process(event);
    } catch {
      this.logger.warn(
        `색인 실패 — BullMQ 재시도 큐 등록: postId=${event.postId} op=${event.operation}`,
      );
      await this.syncQueue.add('sync', event, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      });
    }
  }

  async process(event: PostSyncEvent) {
    switch (event.operation) {
      case 'index':
        await this.searchService.indexPost(event);
        break;
      case 'update':
        await this.searchService.updatePost(event);
        break;
      case 'remove':
        await this.searchService.removePost(event.postId);
        break;
    }
  }
}
