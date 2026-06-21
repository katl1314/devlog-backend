import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { REINDEX_QUEUE } from './search-reindex.processor';
import { REDIS_CLIENT } from './search.constants';
import { Inject } from '@nestjs/common';

const REINDEX_LOCK_KEY = 'reindex:running';
const REINDEX_LOCK_TTL = 7200;

@Injectable()
export class SearchAdminService {
  constructor(
    @InjectQueue(REINDEX_QUEUE) private readonly reindexQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async triggerReindex(triggeredBy: string): Promise<{ jobId: string }> {
    const token = crypto.randomUUID();
    const locked = await this.redis.set(
      REINDEX_LOCK_KEY,
      token,
      'EX',
      REINDEX_LOCK_TTL,
      'NX',
    );

    if (!locked) {
      throw new ConflictException('이미 재색인이 진행 중입니다.');
    }

    const job = await this.reindexQueue.add('reindex', { token, triggeredBy });
    return { jobId: String(job.id) };
  }

  async getJobStatus(jobId: string) {
    const job = await this.reindexQueue.getJob(jobId);
    if (!job) throw new NotFoundException('존재하지 않는 작업입니다.');

    const state = await job.getState();
    return { jobId, state, progress: job.progress, attemptsMade: job.attemptsMade };
  }
}
