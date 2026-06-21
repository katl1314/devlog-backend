import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SearchController } from './search.controller';
import { SearchService, SEARCH_SYNC_QUEUE } from './search.service';
import { SearchSyncHandler } from './search-sync.handler';
import { SearchSyncProcessor } from './search-sync.processor';
import {
  SearchReindexProcessor,
  REINDEX_QUEUE,
} from './search-reindex.processor';
import { SearchAdminService } from './search-admin.service';
import { Client } from '@opensearch-project/opensearch';
import { Redis } from 'ioredis';
import { OPENSEARCH_CLIENT, REDIS_CLIENT } from './search.constants';

export { OPENSEARCH_CLIENT, REDIS_CLIENT };

@Module({
  imports: [
    BullModule.registerQueue({ name: SEARCH_SYNC_QUEUE }),
    BullModule.registerQueue({ name: REINDEX_QUEUE }),
  ],
  controllers: [SearchController],
  providers: [
    {
      provide: OPENSEARCH_CLIENT,
      useFactory: () =>
        new Client({
          node: process.env.OPENSEARCH_URL ?? 'http://localhost:9200',
          ssl: { rejectUnauthorized: false },
        }),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          lazyConnect: true,
        }),
    },
    {
      provide: SearchService,
      useFactory: (osClient: Client, redis: Redis) =>
        new SearchService(osClient, redis),
      inject: [OPENSEARCH_CLIENT, REDIS_CLIENT],
    },
    SearchSyncHandler,
    SearchSyncProcessor,
    SearchReindexProcessor,
    SearchAdminService,
  ],
  exports: [SearchService, SearchAdminService],
})
export class SearchModule {}
