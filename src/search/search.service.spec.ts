import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { SearchService } from './search.service';

const mockOsClient = () => ({
  indices: {
    existsAlias: jest.fn().mockResolvedValue({ body: true }),
    create: jest.fn(),
    putAlias: jest.fn(),
  },
  search: jest.fn(),
  index: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  bulk: jest.fn(),
});

const mockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  ping: jest.fn(),
});

const makeSuggestBody = (posts: any[] = [], tags: any[] = []) => ({
  body: {
    aggregations: {
      titles: { hits: { hits: posts } },
      tags: { buckets: tags },
    },
  },
});

const makeSearchBody = (hits: any[] = [], total = 0) => ({
  body: {
    hits: {
      hits,
      total: { value: total },
    },
    aggregations: {
      related_tags: { buckets: [] },
    },
  },
});

describe('SearchService', () => {
  let service: SearchService;
  let osClient: ReturnType<typeof mockOsClient>;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: 'OPENSEARCH_CLIENT', useFactory: mockOsClient },
        { provide: 'REDIS_CLIENT', useFactory: mockRedis },
      ],
    })
      .overrideProvider(SearchService)
      .useFactory({
        factory: (os: any, r: any) => {
          const svc = new SearchService(os, r);
          return svc;
        },
        inject: ['OPENSEARCH_CLIENT', 'REDIS_CLIENT'],
      })
      .compile();

    service = module.get<SearchService>(SearchService);
    osClient = module.get('OPENSEARCH_CLIENT');
    redis = module.get('REDIS_CLIENT');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────
  // suggest
  // ──────────────────────────────────────────
  describe('suggest', () => {
    it('Redis 캐시가 있으면 OpenSearch를 호출하지 않고 캐시를 반환한다', async () => {
      const cached = { posts: [{ id: '1', title: '캐시된 포스트', userId: 'user1', path: '/p' }], tags: [] };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.suggest({ q: 'NestJS' });

      expect(redis.get).toHaveBeenCalled();
      expect(osClient.search).not.toHaveBeenCalled();
      expect(result).toEqual(cached);
    });

    it('Redis 캐시가 없으면 OpenSearch를 호출하고 결과를 캐시에 저장한다', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue('OK');
      osClient.search.mockResolvedValue(
        makeSuggestBody(
          [{ _source: { post_id: '1', title: '제목', user_id: 'user1', path: '/p' } }],
          [{ key: 'NestJS' }],
        ),
      );

      const result = await service.suggest({ q: 'NestJS' });

      expect(osClient.search).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
      expect(result.posts).toHaveLength(1);
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0].name).toBe('NestJS');
    });

    it('userId가 있으면 user_id 필터를 쿼리에 포함한다', async () => {
      redis.get.mockResolvedValue(null);
      redis.set.mockResolvedValue('OK');
      osClient.search.mockResolvedValue(makeSuggestBody());

      await service.suggest({ q: 'test', userId: 'user1' });

      const searchCall = osClient.search.mock.calls[0][0];
      const filters = searchCall.body.query.bool.filter;
      const userFilter = filters.find((f: any) => f.term?.user_id);
      expect(userFilter).toBeDefined();
      expect(userFilter.term.user_id.value).toBe('user1');
    });
  });

  // ──────────────────────────────────────────
  // search
  // ──────────────────────────────────────────
  describe('search', () => {
    it('첫 페이지 조회 시 relatedTags를 반환한다', async () => {
      osClient.search.mockResolvedValue({
        body: {
          hits: { hits: [], total: { value: 0 } },
          aggregations: { related_tags: { buckets: [{ key: 'TypeScript' }] } },
        },
      });

      const result = await service.search({ q: 'test', take: 10 });

      expect(result.relatedTags).toEqual(['TypeScript']);
    });

    it('커서 페이지 조회 시 relatedTags는 null이다', async () => {
      const cursor = { score: 1, created_at: Date.now(), post_id: 'p1' };
      const after = Buffer.from(JSON.stringify(cursor)).toString('base64url');

      osClient.search.mockResolvedValue(makeSearchBody());

      const result = await service.search({ q: 'test', take: 10, after });

      expect(result.relatedTags).toBeNull();
    });

    it('잘못된 after 커서이면 BadRequestException을 던진다', async () => {
      await expect(service.search({ q: 'test', take: 10, after: 'INVALID_CURSOR' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('take+1개가 조회되면 hasNext가 true이고 cursor가 반환된다', async () => {
      const hits = Array.from({ length: 11 }, (_, i) => ({
        _score: 1,
        _source: {
          post_id: `p${i}`,
          title: `제목${i}`,
          summary: '',
          thumbnail: null,
          user_id: 'user1',
          path: `/p${i}`,
          tags: [],
          created_at: new Date().toISOString(),
        },
      }));

      osClient.search.mockResolvedValue({
        body: {
          hits: { hits, total: { value: 100 } },
          aggregations: { related_tags: { buckets: [] } },
        },
      });

      const result = await service.search({ q: 'test', take: 10 });

      expect(result.hasNext).toBe(true);
      expect(result.cursor).not.toBeNull();
      expect(result.data).toHaveLength(10);
    });

    it('take개 이하로 조회되면 hasNext가 false이다', async () => {
      osClient.search.mockResolvedValue({
        body: {
          hits: { hits: [], total: { value: 0 } },
          aggregations: { related_tags: { buckets: [] } },
        },
      });

      const result = await service.search({ q: 'test', take: 10 });

      expect(result.hasNext).toBe(false);
      expect(result.cursor).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // indexPost / updatePost / removePost
  // ──────────────────────────────────────────
  describe('indexPost', () => {
    it('OpenSearch에 문서를 색인한다', async () => {
      osClient.index.mockResolvedValue({});

      await service.indexPost({
        postId: 'p1',
        operation: 'index',
        payload: {
          title: '제목',
          summary: '요약',
          tags: [],
          thumbnail: null,
          visibility: true,
          status: 'publish',
          userId: 'user1',
          path: '/p1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(osClient.index).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1' }),
      );
    });
  });

  describe('removePost', () => {
    it('OpenSearch에서 문서를 삭제한다', async () => {
      osClient.delete.mockResolvedValue({});

      await service.removePost('p1');

      expect(osClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1' }),
      );
    });

    it('삭제 중 에러가 발생해도 예외를 던지지 않는다', async () => {
      osClient.delete.mockRejectedValue(new Error('not found'));

      await expect(service.removePost('bad-id')).resolves.not.toThrow();
    });
  });

  // ──────────────────────────────────────────
  // bulkIndex
  // ──────────────────────────────────────────
  describe('bulkIndex', () => {
    it('docs가 빈 배열이면 OpenSearch를 호출하지 않고 즉시 반환한다', async () => {
      const result = await service.bulkIndex([]);

      expect(osClient.bulk).not.toHaveBeenCalled();
      expect(result).toEqual({ errors: false, items: [] });
    });

    it('docs가 있으면 OpenSearch bulk API를 호출한다', async () => {
      osClient.bulk.mockResolvedValue({ body: { errors: false, items: [{}] } });

      const result = await service.bulkIndex([{ post_id: 'p1', title: '제목' }]);

      expect(osClient.bulk).toHaveBeenCalled();
      expect(result.errors).toBe(false);
    });
  });
});
