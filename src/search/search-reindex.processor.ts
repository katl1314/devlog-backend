import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { SearchService } from './search.service';
import { REDIS_CLIENT } from './search.constants';

export const REINDEX_QUEUE = 'search-reindex';
const REINDEX_LOCK_KEY = 'reindex:running';
const BATCH_SIZE = 500;

interface RawPost {
  id: string;
  user_id: string;
  path: string;
  title: string;
  summary: string | null;
  thumbnail: string | null;
  visibility: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  tags: string[];
}

interface BulkItem {
  index?: { _id: string; error?: unknown };
}

interface BulkResult {
  errors: boolean;
  items: BulkItem[];
}

const LUA_UNLOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else return 0 end
`;

@Processor(REINDEX_QUEUE)
export class SearchReindexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchReindexProcessor.name);

  constructor(
    private readonly searchService: SearchService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<{ token: string; triggeredBy: string }>) {
    const { token, triggeredBy } = job.data;
    const startedAt = new Date();

    await this.dataSource.query(
      `INSERT INTO search_reindex_audit (job_id, triggered_by, started_at, status)
       VALUES ($1, $2, $3, 'running')`,
      [job.id, triggeredBy, startedAt],
    );

    let successCount = 0;
    let failureCount = 0;
    let cursor: string | null = null;

    try {
      do {
        const rows: RawPost[] = await this.dataSource.query(
          `SELECT p.id, p.user_id, p.path, p.title, p.summary, p.thumbnail, p.visibility,
                  p.status, p.created_at, p.updated_at,
                  COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
           FROM post_model p
           LEFT JOIN post_tags pt ON pt.post_id = p.id
           LEFT JOIN tag_model t ON t.id = pt.tag_id
           WHERE p.visibility = true AND p.status = 'publish' AND p.deleted_at IS NULL
             AND ($1::uuid IS NULL OR p.id > $1::uuid)
           GROUP BY p.id
           ORDER BY p.id ASC
           LIMIT $2`,
          [cursor, BATCH_SIZE],
        );

        if (!rows.length) break;

        const docs = rows.map((r) => ({
          post_id: r.id,
          user_id: r.user_id,
          path: r.path ?? '',
          title: r.title,
          summary: r.summary ?? '',
          tags: r.tags,
          thumbnail: r.thumbnail ?? null,
          visibility: r.visibility,
          status: r.status,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

        const result = (await this.searchService.bulkIndex(docs)) as BulkResult;

        if (result.errors) {
          const failed = result.items
            .filter((item) => item.index?.error)
            .map((item) => item.index!._id);
          failureCount += failed.length;
          successCount += docs.length - failed.length;

          for (const postId of failed) {
            await this.dataSource.query(
              `INSERT INTO search_sync_failures (post_id, operation, error, status)
               VALUES ($1, 'index', 'bulk reindex failed', 'pending')
               ON CONFLICT DO NOTHING`,
              [postId],
            );
          }
        } else {
          successCount += docs.length;
        }

        cursor = rows[rows.length - 1].id;
      } while (cursor !== null);

      await this.dataSource.query(
        `UPDATE search_reindex_audit
         SET finished_at = $1, total_count = $2, success_count = $3, failure_count = $4, status = 'completed'
         WHERE job_id = $5`,
        [
          new Date(),
          successCount + failureCount,
          successCount,
          failureCount,
          job.id,
        ],
      );

      await this.dataSource.query(
        `UPDATE search_sync_failures SET status = 'resolved', resolved_at = now()
         WHERE status = 'pending' AND created_at < $1`,
        [startedAt],
      );

      this.logger.log(
        `reindex 완료: 성공=${successCount} 실패=${failureCount}`,
      );
    } catch (e) {
      await this.dataSource.query(
        `UPDATE search_reindex_audit SET finished_at = $1, status = 'failed' WHERE job_id = $2`,
        [new Date(), job.id],
      );
      throw e;
    } finally {
      await this.redis.eval(LUA_UNLOCK, 1, REINDEX_LOCK_KEY, token);
    }
  }
}
