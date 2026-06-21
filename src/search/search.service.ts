import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { Redis } from 'ioredis';
import * as CircuitBreaker from 'opossum';
import { PostSyncEvent } from '../types/express';
import { SearchQueryDto, SuggestQueryDto } from './dto/search-query.dto';

const INDEX = 'posts_v1';
const INDEX_ALIAS = 'posts';
export const SEARCH_SYNC_QUEUE = 'search-sync';

// ── OpenSearch 응답 타입 ───────────────────────────────────────

interface OsFilter {
  term: Record<string, { value: string | boolean | number }>;
}

interface SuggestHitSource {
  post_id: string;
  title: string;
  user_id: string;
  path: string;
}

interface SuggestHit {
  _source: SuggestHitSource;
}

interface TagBucket {
  key: string;
}

interface SuggestBody {
  aggregations: {
    titles: { hits: { hits: SuggestHit[] } };
    tags: { buckets: TagBucket[] };
  };
}

interface SearchHitSource {
  post_id: string;
  title: string;
  summary: string;
  thumbnail: string | null;
  user_id: string;
  path: string;
  tags: string[];
  created_at: string;
}

interface SearchHit {
  _score: number;
  _source: SearchHitSource;
}

interface SearchBody {
  hits: { hits: SearchHit[]; total: { value: number } };
  aggregations?: { related_tags?: { buckets: TagBucket[] } };
}

export interface BulkIndexResponse {
  errors: boolean;
  items: Array<{ index: { _id: string; error?: unknown } }>;
}

interface SearchCursor {
  score: number;
  created_at: number;
  post_id: string;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly breaker: CircuitBreaker;
  private redisHealthy = true;
  private redisProbeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly osClient: Client,
    private readonly redis: Redis,
  ) {
    this.breaker = new CircuitBreaker((fn: () => Promise<unknown>) => fn(), {
      timeout: 3000,
      volumeThreshold: 5,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });
    this.breaker.fallback(() => {
      throw new ServiceUnavailableException(
        '검색 서비스를 일시적으로 사용할 수 없습니다.',
      );
    });
  }

  async onModuleInit() {
    await this.ensureIndex();
  }

  private async ensureIndex() {
    try {
      const exists = await this.osClient.indices.existsAlias({
        name: INDEX_ALIAS,
      });
      if (exists.body) return;

      await this.osClient.indices.create({
        index: INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            refresh_interval: '1s',
            analysis: {
              tokenizer: {
                nori_mixed: {
                  type: 'nori_tokenizer',
                  decompound_mode: 'mixed',
                },
                edge_ngram_tokenizer: {
                  type: 'edge_ngram',
                  min_gram: 1,
                  max_gram: 20,
                  token_chars: ['letter', 'digit'],
                },
              },
              filter: {
                nori_posfilter: {
                  type: 'nori_part_of_speech',
                  stoptags: [
                    'E',
                    'IC',
                    'J',
                    'MAG',
                    'MM',
                    'SP',
                    'SSC',
                    'SSO',
                    'SC',
                    'SE',
                    'XPN',
                    'XSA',
                    'XSN',
                    'XSV',
                    'UNA',
                    'NA',
                    'VSV',
                  ],
                },
              },
              analyzer: {
                korean_index: {
                  type: 'custom',
                  tokenizer: 'nori_mixed',
                  filter: ['nori_posfilter', 'lowercase', 'nori_readingform'],
                },
                korean_search: {
                  type: 'custom',
                  tokenizer: 'nori_mixed',
                  filter: ['nori_posfilter', 'lowercase', 'nori_readingform'],
                },
                autocomplete_index: {
                  type: 'custom',
                  tokenizer: 'edge_ngram_tokenizer',
                  filter: ['lowercase'],
                },
                autocomplete_search: {
                  type: 'custom',
                  tokenizer: 'nori_mixed',
                  filter: ['nori_posfilter', 'lowercase'],
                },
              },
            },
          },
          mappings: {
            properties: {
              post_id: { type: 'keyword' },
              user_id: { type: 'keyword' },
              path: { type: 'keyword', index: false },
              title: {
                type: 'text',
                analyzer: 'korean_index',
                search_analyzer: 'korean_search',
                fields: {
                  autocomplete: {
                    type: 'text',
                    analyzer: 'autocomplete_index',
                    search_analyzer: 'autocomplete_search',
                  },
                },
              },
              summary: {
                type: 'text',
                analyzer: 'korean_index',
                search_analyzer: 'korean_search',
              },
              tags: { type: 'keyword' },
              thumbnail: { type: 'keyword', index: false },
              visibility: { type: 'boolean' },
              status: { type: 'keyword' },
              created_at: { type: 'date' },
              updated_at: { type: 'date' },
            },
          },
        },
      });

      await this.osClient.indices.putAlias({ index: INDEX, name: INDEX_ALIAS });
      this.logger.log(`인덱스 ${INDEX} 생성 완료`);
    } catch (e) {
      this.logger.warn(
        `인덱스 초기화 실패 (OpenSearch 미연결 상태일 수 있음): ${e}`,
      );
    }
  }

  // ── 자동완성 ──────────────────────────────────────────────

  async suggest(dto: SuggestQueryDto) {
    const cacheKey = `suggest:${encodeURIComponent(dto.q.toLowerCase().trim())}${dto.userId ? `:${dto.userId}` : ''}`;

    if (this.redisHealthy) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached)
          return JSON.parse(cached) as ReturnType<typeof this.querySuggest>;
      } catch {
        this.enterDegradedMode();
      }
    }

    const result = await this.breaker.fire(() => this.querySuggest(dto));

    if (this.redisHealthy) {
      this.redis
        .set(cacheKey, JSON.stringify(result), 'EX', 60)
        .catch(() => this.enterDegradedMode());
    }

    return result;
  }

  private async querySuggest(dto: SuggestQueryDto) {
    const filter: OsFilter[] = [
      { term: { visibility: { value: true } } },
      { term: { status: { value: 'publish' } } },
    ];
    if (dto.userId) filter.push({ term: { user_id: { value: dto.userId } } });

    const { body } = await this.osClient.search({
      index: INDEX_ALIAS,
      body: {
        size: 0,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: dto.q,
                  fields: ['title.autocomplete', 'tags'],
                  type: 'best_fields',
                },
              },
            ],
            filter,
          },
        },
        aggs: {
          titles: {
            top_hits: { size: 5, _source: ['post_id', 'title', 'user_id', 'path'] },
          },
          tags: { terms: { field: 'tags', size: 3 } },
        },
      },
    });

    const typed = body as unknown as SuggestBody;
    const hits = typed.aggregations?.titles?.hits?.hits ?? [];
    const tagBuckets = typed.aggregations?.tags?.buckets ?? [];

    return {
      posts: hits.map((h) => ({
        id: h._source.post_id,
        title: h._source.title,
        userId: h._source.user_id,
        path: h._source.path ?? '',
      })),
      tags: tagBuckets.map((b) => ({ name: b.key })),
    };
  }

  // ── 검색 실행 ──────────────────────────────────────────────

  async search(dto: SearchQueryDto) {
    const { q, after, take = 10, userId } = dto;

    let searchAfter: [number, number, string] | undefined;
    if (after) {
      try {
        const decoded = JSON.parse(
          Buffer.from(after, 'base64url').toString('utf8'),
        ) as SearchCursor;
        if (
          typeof decoded.score !== 'number' ||
          typeof decoded.created_at !== 'number' ||
          typeof decoded.post_id !== 'string'
        ) {
          throw new Error();
        }
        searchAfter = [decoded.score, decoded.created_at, decoded.post_id];
      } catch {
        throw new BadRequestException('잘못된 커서 값입니다.');
      }
    }

    const filter: OsFilter[] = [
      { term: { visibility: { value: true } } },
      { term: { status: { value: 'publish' } } },
    ];
    if (userId) filter.push({ term: { user_id: { value: userId } } });

    const isFirstPage = !after;

    const res = await this.breaker.fire(() =>
      this.osClient.search({
        index: INDEX_ALIAS,
        body: {
          size: take + 1,
          query: {
            bool: {
              must: [
                {
                  simple_query_string: {
                    query: q,
                    fields: ['title^3', 'summary', 'tags^2'],
                    flags: 'PHRASE|PREFIX',
                  },
                },
              ],
              filter,
            },
          },
          sort: [
            { _score: 'desc' },
            { created_at: 'desc' },
            { post_id: 'asc' },
          ],
          ...(searchAfter ? { search_after: searchAfter } : {}),
          ...(isFirstPage
            ? {
                aggs: {
                  related_tags: {
                    terms: { field: 'tags', size: 5, shard_size: 20 },
                  },
                },
              }
            : {}),
          track_total_hits: true,
        },
      }),
    );

    const body = (res as { body: SearchBody }).body;
    const hits = body.hits?.hits ?? [];
    const hasNext = hits.length > take;
    const data = hasNext ? hits.slice(0, take) : hits;

    let cursor: { after: string } | null = null;
    if (hasNext) {
      const last = data[data.length - 1];
      const cur: SearchCursor = {
        score: last._score,
        created_at: new Date(last._source.created_at).getTime(),
        post_id: last._source.post_id,
      };
      cursor = {
        after: Buffer.from(JSON.stringify(cur)).toString('base64url'),
      };
    }

    const relatedTags = isFirstPage
      ? (body.aggregations?.related_tags?.buckets ?? []).map((b) => b.key)
      : null;

    return {
      data: data.map((h) => ({
        id: h._source.post_id,
        title: h._source.title,
        summary: h._source.summary,
        thumbnail: h._source.thumbnail ?? null,
        userId: h._source.user_id,
        path: h._source.path ?? '',
        tags: h._source.tags ?? [],
        createdAt: h._source.created_at,
      })),
      hasNext,
      cursor,
      count: body.hits?.total?.value ?? 0,
      relatedTags,
    };
  }

  // ── 색인 CRUD ──────────────────────────────────────────────

  async indexPost(event: PostSyncEvent) {
    const { postId, payload } = event;
    await this.osClient.index({
      index: INDEX_ALIAS,
      id: postId,
      body: {
        post_id: postId,
        user_id: payload!.userId,
        path: payload!.path ?? '',
        title: payload!.title,
        summary: payload!.summary ?? '',
        tags: payload!.tags ?? [],
        thumbnail: payload!.thumbnail ?? null,
        visibility: payload!.visibility,
        status: payload!.status,
        created_at: payload!.createdAt,
        updated_at: payload!.updatedAt,
      },
    });
  }

  async updatePost(event: PostSyncEvent) {
    const { postId, payload } = event;
    await this.osClient.update({
      index: INDEX_ALIAS,
      id: postId,
      body: {
        doc: {
          title: payload!.title,
          summary: payload!.summary ?? '',
          tags: payload!.tags ?? [],
          thumbnail: payload!.thumbnail ?? null,
          visibility: payload!.visibility,
          status: payload!.status,
          updated_at: payload!.updatedAt,
        },
      },
    });
  }

  async removePost(postId: string) {
    await this.osClient
      .delete({ index: INDEX_ALIAS, id: postId })
      .catch(() => {});
  }

  async bulkIndex(docs: Record<string, unknown>[]): Promise<BulkIndexResponse> {
    if (!docs.length) return { errors: false, items: [] };
    const body = docs.flatMap((doc) => [
      { index: { _index: INDEX_ALIAS, _id: doc.post_id } },
      doc,
    ]);
    const { body: res } = await this.osClient.bulk({ body });
    return res as unknown as BulkIndexResponse;
  }

  // ── Redis degraded mode ────────────────────────────────────

  private enterDegradedMode() {
    if (!this.redisHealthy) return;
    this.redisHealthy = false;
    this.logger.warn('Redis 장애 감지 — degraded mode 진입');
    this.startProbe();
  }

  private startProbe() {
    if (this.redisProbeTimer) return;
    let successCount = 0;
    this.redisProbeTimer = setInterval(() => {
      this.redis
        .ping()
        .then(() => {
          successCount++;
          if (successCount >= 2) {
            this.redisHealthy = true;
            successCount = 0;
            clearInterval(this.redisProbeTimer!);
            this.redisProbeTimer = null;
            this.logger.log('Redis 복구 — normal mode 전환');
          }
        })
        .catch(() => {
          successCount = 0;
        });
    }, 10000);
  }
}
