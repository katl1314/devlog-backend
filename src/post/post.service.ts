import { CommonService, PaginateProps } from '../common/common.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, FindOptionsWhere, In, QueryRunner, Repository } from 'typeorm';
import { PostModel } from './entity/post.entity';
import { generateTimestamp, isEmpty } from '../common/util/util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { PostLikeModel } from './entity/post_like.entity';
import { UserModel } from '../auth/entity/user.entity';
import { UserFollowModel } from '../auth/entity/user_follow.entity';
import { TagModel } from '../tag/entity/tag.entity';
import {
  STORAGE_BUCKET_POST,
  STORAGE_SERVICE,
  StorageInterface,
} from 'src/storage/storage.interface';

interface PostPaginateProps extends PaginateProps {
  userId?: string;
}

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(PostModel)
    private readonly postRepository: Repository<PostModel>,
    @InjectRepository(PostLikeModel)
    private readonly postLikeRepository: Repository<PostLikeModel>,
    @InjectRepository(UserFollowModel)
    private readonly followRepository: Repository<UserFollowModel>,
    @InjectRepository(UserModel)
    private readonly userRepository: Repository<UserModel>,
    private readonly commonService: CommonService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageInterface,
  ) {}

  getRepository(qr?: QueryRunner) {
    return isEmpty(qr)
      ? this.postRepository
      : qr.manager.getRepository(PostModel);
  }

  /*
   * @name create
   * @version 1.0
   * @description 포스트를 등록하는 함수
   * @params {CreatePostDto | Y} post 등록할 포스트 객체
   * @params {QueryRunner | N} qr 트랜잭션을 위한 쿼리러너 객체
   * @returns
   * */
  async create(
    post: CreatePostDto & { user_id: string; tags?: TagModel[] },
    qr?: QueryRunner,
  ) {
    const repo = this.getRepository(qr);
    post.status = 'publish';
    const storageKey = `${post.user_id}_${generateTimestamp()}`; // 사용자ID_

    await this.storageService.upload(
      STORAGE_BUCKET_POST,
      storageKey,
      post.content,
    );

    post.content = storageKey;
    const newPost = repo.create(post);
    return await repo.save(newPost);
  }

  async findById(id: string, user_id: string) {
    const post = await this.postRepository.findOne({
      relations: {
        tags: true,
      },
      where: { id: Equal(id), user_id: Equal(user_id) },
    });
    if (!post) throw new NotFoundException('포스트를 찾을 수 없습니다.');

    const content = await this.storageService.get(
      STORAGE_BUCKET_POST,
      post.content,
    );

    if (isEmpty(content)) {
      throw new NotFoundException('포스트를 찾을 수 없습니다.');
    }

    post.content = content;

    return post;
  }

  async update(
    id: string,
    user_id: string,
    dto: UpdatePostDto & { tags?: TagModel[] },
    qr?: QueryRunner,
  ) {
    const repo = this.getRepository(qr);
    const post = await repo.findOne({
      relations: { tags: true },
      where: { id: Equal(id), user_id: Equal(user_id) },
    });
    if (!post) throw new NotFoundException('포스트를 찾을 수 없습니다.');

    const { tags, content, ...fields } = dto;

    if (content) {
      await this.storageService.upload(
        STORAGE_BUCKET_POST,
        post.content,
        content as string,
      );
    }

    Object.assign(post, fields);
    if (tags !== undefined) post.tags = tags;

    return await repo.save(post);
  }

  async delete(id: string, user_id: string, qr?: QueryRunner) {
    const repo = this.getRepository(qr);
    const _where: FindOptionsWhere<PostModel> = {
      id,
      user_id,
    };
    const isExist = await repo.exists({ where: _where });

    if (!isExist) throw new BadRequestException('post가 존재하지 않습니다.');

    return await repo.delete(_where);
  }

  /*
   * @name getPosts
   * @version 1.0
   * @description 포스트 리스트를 가져오는 함수
   * @params {PaginateDto | Y} dto 페이징을 위한 객체
   * @Params {Number | Y} dto.cursor 커서
   * @Params {Number | N} dto.take 조회할 개수
   * @returns
   * */
  async getPosts(dto: PostPaginateProps, requesterId?: string) {
    const relations = { comments: true, likes: true };
    const where = this.buildVisibilityWhere(dto.userId, requesterId);
    return await this.commonService.paginate(
      dto,
      this.postRepository,
      where,
      relations,
    );
  }

  async getFollowingFeed(dto: PaginateProps, requesterUUID: string) {
    const follows = await this.followRepository.find({
      where: { follower_id: requesterUUID },
      select: ['following_id'],
    });

    if (!follows.length) {
      return { data: [], hasNext: false, cursor: { after: null }, count: 0 };
    }

    const followingUUIDs = follows.map((f) => f.following_id);
    const users = await this.userRepository.find({
      where: { id: In(followingUUIDs) },
      select: ['user_id'],
    });
    const slugs = users.map((u) => u.user_id);

    if (!slugs.length) {
      return { data: [], hasNext: false, cursor: { after: null }, count: 0 };
    }

    const where: FindOptionsWhere<PostModel> = {
      user_id: In(slugs),
      visibility: true,
    };
    return await this.commonService.paginate(dto, this.postRepository, where, {
      comments: true,
      likes: true,
    });
  }

  private buildVisibilityWhere(userId?: string, requesterId?: string) {
    if (userId) {
      const base = { user_id: Equal(userId) };
      // 본인 프로필 조회 시 비공개 포스트도 포함
      if (requesterId === userId) {
        return [
          { ...base, visibility: true },
          { ...base, visibility: false },
        ];
      }
      return { ...base, visibility: true };
    }

    // 글로벌 피드: 공개 포스트 + 내가 작성한 비공개 포스트
    if (requesterId) {
      return [
        { visibility: true },
        { visibility: false, user_id: Equal(requesterId) },
      ];
    }
    return { visibility: true };
  }

  /*
   * @name getPost
   * @version 1.0
   * @description 포스트 조회하는 함수
   * @Params {string | Y} userId 사용자 ID
   * @Params {string | N} postId 포스트 ID
   * @returns
   * */
  async getPost(userId: string, postId: string, requesterId?: string) {
    const result = await this.postRepository.findOne({
      relations: {
        user: {
          blog: true,
        },
        tags: true,
        likes: true,
        comments: true,
      },
      where: {
        user_id: Equal(userId),
        path: Equal(`/${postId}`),
      },
    });

    if (isEmpty(result)) {
      throw new NotFoundException('포스트를 찾을 수 없습니다.');
    }

    if (!result.visibility && result.user_id !== requesterId) {
      throw new NotFoundException('포스트를 찾을 수 없습니다.');
    }

    const content = await this.storageService.get(
      STORAGE_BUCKET_POST,
      result.content,
    );

    if (isEmpty(content)) {
      throw new NotFoundException('포스트를 찾을 수 없습니다.');
    }

    result.content = content;

    return result;
  }

  /*
   * @name getLike
   * @version 1.0
   * @description 특정 포스트에 유저가 좋아요를 눌렀는지 조회하는 함수
   * @Params {number | Y} postId 포스트 ID
   * @Params {string | Y} userId 사용자 ID
   * @returns { isLiked: boolean }
   * */
  async getLike(postId: string, userId: string) {
    try {
      const like = await this.postLikeRepository.exists({
        where: {
          post_id: Equal(postId),
          user_id: Equal(userId),
        },
      });
      return { isLiked: !!like };
    } catch {
      return { isLike: false };
    }
  }

  /*
   * @name like
   * @version 1.0
   * @description 포스트 좋아요 눌렀을때 함수
   * @Params {string | Y} userId 사용자 ID
   * @Params {string | Y} postId 포스트 ID
   * @Params {string | Y} 좋아요인지
   * @returns
   * */
  async doLike(user: UserModel, postId: string, isLike: boolean) {
    // 포스트를 먼저 찾아야한다.
    const post = await this.postRepository.findOne({
      where: {
        id: Equal(postId),
      },
    });

    if (isEmpty(post)) {
      throw new NotFoundException('포스트를 찾을 수 없습니다.');
    }

    if (isLike) {
      const like = this.postLikeRepository.create({
        post: post,
        user: user,
      });

      // 실제 데이터베이스에 저장해야한다.
      await this.postLikeRepository.save(like);

      return like;
    } else {
      // 삭제해야함.
      return await this.postLikeRepository.delete({
        post_id: postId,
        user_id: user.id,
      });
    }
  }
}
