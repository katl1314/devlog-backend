import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PostService } from './post.service';
import { PostModel } from './entity/post.entity';
import { PostLikeModel } from './entity/post_like.entity';
import { UserModel } from '../auth/entity/user.entity';
import { UserFollowModel } from '../auth/entity/user_follow.entity';
import { CommonService } from '../common/common.service';
import { STORAGE_SERVICE } from 'src/storage/storage.interface';

const mockPostRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  exists: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
});

const mockPostLikeRepository = () => ({
  exists: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

const mockFollowRepository = () => ({
  find: jest.fn(),
});

const mockUserRepository = () => ({
  find: jest.fn(),
});

const mockCommonService = () => ({
  paginate: jest.fn(),
});

const mockStorageService = () => ({
  upload: jest.fn(),
  get: jest.fn(),
});

const makePost = (overrides = {}): Partial<PostModel> => ({
  id: 'post-uuid-1',
  user_id: 'user1',
  title: '테스트 포스트',
  content: 'storage-key-1',
  summary: '요약',
  path: '/test-post',
  visibility: true,
  status: 'publish' as any,
  thumbnail: null,
  tags: [],
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
});

describe('PostService', () => {
  let service: PostService;
  let postRepo: ReturnType<typeof mockPostRepository>;
  let postLikeRepo: ReturnType<typeof mockPostLikeRepository>;
  let followRepo: ReturnType<typeof mockFollowRepository>;
  let userRepo: ReturnType<typeof mockUserRepository>;
  let storageService: ReturnType<typeof mockStorageService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: getRepositoryToken(PostModel), useFactory: mockPostRepository },
        { provide: getRepositoryToken(PostLikeModel), useFactory: mockPostLikeRepository },
        { provide: getRepositoryToken(UserFollowModel), useFactory: mockFollowRepository },
        { provide: getRepositoryToken(UserModel), useFactory: mockUserRepository },
        { provide: CommonService, useFactory: mockCommonService },
        { provide: STORAGE_SERVICE, useFactory: mockStorageService },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    postRepo = module.get(getRepositoryToken(PostModel));
    postLikeRepo = module.get(getRepositoryToken(PostLikeModel));
    followRepo = module.get(getRepositoryToken(UserFollowModel));
    userRepo = module.get(getRepositoryToken(UserModel));
    storageService = module.get(STORAGE_SERVICE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────
  // create
  // ──────────────────────────────────────────
  describe('create', () => {
    it('포스트를 생성하고 스토리지에 content를 업로드한다', async () => {
      const post = makePost();
      postRepo.create.mockReturnValue(post);
      postRepo.save.mockResolvedValue(post);
      storageService.upload.mockResolvedValue(undefined);

      const dto = { title: '제목', content: '본문', user_id: 'user1' };
      const result = await service.create(dto as any);

      expect(storageService.upload).toHaveBeenCalled();
      expect(postRepo.save).toHaveBeenCalled();
      expect(result).toEqual(post);
    });

    it('visibility가 true이면 pendingEvents에 index 이벤트를 추가한다', async () => {
      const post = makePost({ visibility: true });
      postRepo.create.mockReturnValue(post);
      postRepo.save.mockResolvedValue(post);
      storageService.upload.mockResolvedValue(undefined);

      const pendingEvents: any[] = [];
      await service.create({ title: '제목', content: '본문', user_id: 'user1' } as any, undefined, pendingEvents);

      expect(pendingEvents).toHaveLength(1);
      expect(pendingEvents[0].operation).toBe('index');
    });

    it('visibility가 false이면 pendingEvents에 이벤트를 추가하지 않는다', async () => {
      const post = makePost({ visibility: false });
      postRepo.create.mockReturnValue(post);
      postRepo.save.mockResolvedValue(post);
      storageService.upload.mockResolvedValue(undefined);

      const pendingEvents: any[] = [];
      await service.create({ title: '제목', content: '본문', user_id: 'user1' } as any, undefined, pendingEvents);

      expect(pendingEvents).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────
  // findById
  // ──────────────────────────────────────────
  describe('findById', () => {
    it('포스트가 존재하면 스토리지에서 content를 읽어 반환한다', async () => {
      const post = makePost();
      postRepo.findOne.mockResolvedValue(post);
      storageService.get.mockResolvedValue('# 마크다운 내용');

      const result = await service.findById('post-uuid-1', 'user1');

      expect(storageService.get).toHaveBeenCalled();
      expect(result.content).toBe('# 마크다운 내용');
    });

    it('포스트가 없으면 NotFoundException을 던진다', async () => {
      postRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('bad-id', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('스토리지에서 content가 비어있으면 NotFoundException을 던진다', async () => {
      const post = makePost();
      postRepo.findOne.mockResolvedValue(post);
      storageService.get.mockResolvedValue(null);

      await expect(service.findById('post-uuid-1', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────
  // update
  // ──────────────────────────────────────────
  describe('update', () => {
    it('포스트가 없으면 NotFoundException을 던진다', async () => {
      postRepo.findOne.mockResolvedValue(null);

      await expect(service.update('bad-id', 'user1', {})).rejects.toThrow(NotFoundException);
    });

    it('비공개→공개로 변경되면 pendingEvents에 index 이벤트를 추가한다', async () => {
      const original = makePost({ visibility: false });
      const saved = makePost({ visibility: true });
      postRepo.findOne.mockResolvedValue(original);
      postRepo.save.mockResolvedValue(saved);

      const pendingEvents: any[] = [];
      await service.update('post-uuid-1', 'user1', { visibility: true }, undefined, pendingEvents);

      expect(pendingEvents[0].operation).toBe('index');
    });

    it('공개→비공개로 변경되면 pendingEvents에 remove 이벤트를 추가한다', async () => {
      const original = makePost({ visibility: true });
      const saved = makePost({ visibility: false });
      postRepo.findOne.mockResolvedValue(original);
      postRepo.save.mockResolvedValue(saved);

      const pendingEvents: any[] = [];
      await service.update('post-uuid-1', 'user1', { visibility: false }, undefined, pendingEvents);

      expect(pendingEvents[0].operation).toBe('remove');
    });

    it('공개 상태 유지이면 pendingEvents에 update 이벤트를 추가한다', async () => {
      const original = makePost({ visibility: true });
      const saved = makePost({ visibility: true, title: '수정된 제목' });
      postRepo.findOne.mockResolvedValue(original);
      postRepo.save.mockResolvedValue(saved);

      const pendingEvents: any[] = [];
      await service.update('post-uuid-1', 'user1', { title: '수정된 제목' }, undefined, pendingEvents);

      expect(pendingEvents[0].operation).toBe('update');
    });
  });

  // ──────────────────────────────────────────
  // delete
  // ──────────────────────────────────────────
  describe('delete', () => {
    it('포스트가 없으면 BadRequestException을 던진다', async () => {
      postRepo.exists.mockResolvedValue(false);

      await expect(service.delete('bad-id', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('포스트가 있으면 삭제 후 pendingEvents에 remove 이벤트를 추가한다', async () => {
      postRepo.exists.mockResolvedValue(true);
      postRepo.delete.mockResolvedValue({ affected: 1 });

      const pendingEvents: any[] = [];
      await service.delete('post-uuid-1', 'user1', undefined, pendingEvents);

      expect(postRepo.delete).toHaveBeenCalled();
      expect(pendingEvents[0].operation).toBe('remove');
      expect(pendingEvents[0].postId).toBe('post-uuid-1');
    });
  });

  // ──────────────────────────────────────────
  // getLike
  // ──────────────────────────────────────────
  describe('getLike', () => {
    it('좋아요를 눌렀으면 { isLiked: true }를 반환한다', async () => {
      postLikeRepo.exists.mockResolvedValue(true);

      const result = await service.getLike('post-uuid-1', 'user1');
      expect(result).toEqual({ isLiked: true });
    });

    it('좋아요를 누르지 않았으면 { isLiked: false }를 반환한다', async () => {
      postLikeRepo.exists.mockResolvedValue(false);

      const result = await service.getLike('post-uuid-1', 'user1');
      expect(result).toEqual({ isLiked: false });
    });
  });

  // ──────────────────────────────────────────
  // doLike
  // ──────────────────────────────────────────
  describe('doLike', () => {
    const mockUser = { id: 'user-uuid-1' } as any;

    it('포스트가 없으면 NotFoundException을 던진다', async () => {
      postRepo.findOne.mockResolvedValue(null);

      await expect(service.doLike(mockUser, 'bad-id', true)).rejects.toThrow(NotFoundException);
    });

    it('isLike가 true이면 좋아요를 생성하고 저장한다', async () => {
      const post = makePost();
      const like = { post, user: mockUser };
      postRepo.findOne.mockResolvedValue(post);
      postLikeRepo.create.mockReturnValue(like);
      postLikeRepo.save.mockResolvedValue(like);

      const result = await service.doLike(mockUser, 'post-uuid-1', true);

      expect(postLikeRepo.save).toHaveBeenCalledWith(like);
      expect(result).toEqual(like);
    });

    it('isLike가 false이면 좋아요를 삭제한다', async () => {
      const post = makePost();
      postRepo.findOne.mockResolvedValue(post);
      postLikeRepo.delete.mockResolvedValue({ affected: 1 });

      await service.doLike(mockUser, 'post-uuid-1', false);

      expect(postLikeRepo.delete).toHaveBeenCalledWith({
        post_id: 'post-uuid-1',
        user_id: 'user-uuid-1',
      });
    });
  });

  // ──────────────────────────────────────────
  // getFollowingFeed
  // ──────────────────────────────────────────
  describe('getFollowingFeed', () => {
    it('팔로우한 사용자가 없으면 빈 피드를 반환한다', async () => {
      followRepo.find.mockResolvedValue([]);

      const result = await service.getFollowingFeed({ cursor: null, take: 10 }, 'requester-uuid');

      expect(result).toEqual({ data: [], hasNext: false, cursor: { after: null }, count: 0 });
    });

    it('팔로우 중이나 해당 유저 정보가 없으면 빈 피드를 반환한다', async () => {
      followRepo.find.mockResolvedValue([{ following_id: 'uuid-x' }]);
      userRepo.find.mockResolvedValue([]);

      const result = await service.getFollowingFeed({ cursor: null, take: 10 }, 'requester-uuid');

      expect(result).toEqual({ data: [], hasNext: false, cursor: { after: null }, count: 0 });
    });
  });
});
