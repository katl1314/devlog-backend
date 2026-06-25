import { Test, TestingModule } from '@nestjs/testing';
import { CommonService } from './common.service';

const mockRepository = () => ({
  find: jest.fn(),
});

const makePost = (overrides = {}) => ({
  id: 'post-uuid-1',
  user_id: 'user1',
  title: '테스트',
  created_at: new Date('2024-06-01T12:00:00Z'),
  visibility: true,
  ...overrides,
});

describe('CommonService', () => {
  let service: CommonService;
  let repo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommonService],
    }).compile();

    service = module.get<CommonService>(CommonService);
    repo = mockRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('paginate (cursorPaginate)', () => {
    it('cursor가 null이면 created_at 필터 없이 조회한다', async () => {
      const posts = [makePost(), makePost({ id: 'post-uuid-2' })];
      repo.find.mockResolvedValue(posts);

      const result = await service.paginate({ cursor: null, take: 10 }, repo as any, {}, {});

      const findOptions = repo.find.mock.calls[0][0];
      const whereKeys = Object.keys(findOptions.where ?? {});
      expect(whereKeys).not.toContain('created_at');
      expect(result.data).toHaveLength(2);
    });

    it('cursor가 유효한 날짜이면 created_at LessThan 조건이 추가된다', async () => {
      repo.find.mockResolvedValue([makePost()]);

      await service.paginate(
        { cursor: '2024-06-01T12:00:00.000Z', take: 10 },
        repo as any,
        {},
        {},
      );

      const findOptions = repo.find.mock.calls[0][0];
      expect(findOptions.where.created_at).toBeDefined();
    });

    it('cursor가 유효하지 않은 날짜이면 cursor 조건 없이 조회한다', async () => {
      repo.find.mockResolvedValue([makePost()]);

      await service.paginate({ cursor: 'not-a-date', take: 10 }, repo as any, {}, {});

      const findOptions = repo.find.mock.calls[0][0];
      expect(findOptions.where.created_at).toBeUndefined();
    });

    it('take+1개가 반환되면 hasNext가 true이고 cursor.after가 설정된다', async () => {
      const posts = Array.from({ length: 11 }, (_, i) =>
        makePost({ id: `post-${i}`, created_at: new Date(`2024-06-0${11 - i}T12:00:00Z`) }),
      );
      repo.find.mockResolvedValue(posts);

      const result = await service.paginate({ cursor: null, take: 10 }, repo as any, {}, {});

      expect(result.hasNext).toBe(true);
      expect(result.cursor.after).not.toBeNull();
      expect(result.data).toHaveLength(10);
    });

    it('take개 이하가 반환되면 hasNext가 false이고 cursor.after가 null이다', async () => {
      const posts = [makePost(), makePost({ id: 'post-uuid-2' })];
      repo.find.mockResolvedValue(posts);

      const result = await service.paginate({ cursor: null, take: 10 }, repo as any, {}, {});

      expect(result.hasNext).toBe(false);
      expect(result.cursor.after).toBeNull();
    });

    it('where 조건이 배열이면 각 조건에 created_at 필터를 추가한다', async () => {
      repo.find.mockResolvedValue([makePost()]);

      await service.paginate(
        { cursor: '2024-06-01T12:00:00.000Z', take: 10 },
        repo as any,
        [{ visibility: true }, { visibility: false, user_id: 'user1' }],
        {},
      );

      const findOptions = repo.find.mock.calls[0][0];
      expect(Array.isArray(findOptions.where)).toBe(true);
      findOptions.where.forEach((w: any) => {
        expect(w.created_at).toBeDefined();
      });
    });

    it('결과가 없으면 data는 빈 배열이고 cursor.after는 null이다', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.paginate({ cursor: null, take: 10 }, repo as any, {}, {});

      expect(result.data).toEqual([]);
      expect(result.cursor.after).toBeNull();
      expect(result.hasNext).toBe(false);
    });
  });
});
