import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TransactionInterceptor } from '../common/interceptor/transaction.interceptor';
import {
  AccessTokenGuard,
  OptionalAccessTokenGuard,
} from '../auth/guard/bearer-token.guard';
import { PostService } from './post.service';
import { QueryFailedError, QueryRunner } from 'typeorm';
import { TagService } from '../tag/tag.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostModel } from './entity/post.entity';
import { UserModel } from '../auth/entity/user.entity';
import { DB_ERROR_CODE } from '../common/const/db-error-code.const';

import { PostSyncEvent } from '../types/express';

interface IRequest extends Request {
  qr: QueryRunner;
  user: UserModel & { user_id: string };
  pendingSearchEvents: PostSyncEvent[];
}

/**
 * 포스트 API 컨트롤러.
 *
 * @remarks
 * Base URL: `/post`
 *
 * [공개 / 선택 인증]
 * - `GET    /post`                  포스트 목록 조회 (커서 페이지네이션)
 * - `GET    /post/:userId/:path`    단일 포스트 조회 (경로 기반)
 *
 * [인증 필요]
 * - `POST   /post`                  포스트 작성 (태그 포함, 트랜잭션)
 * - `DELETE /post/:userId/:path`    포스트 삭제 (트랜잭션, WIP)
 * - `GET    /post/:postId/like/me`  현재 사용자의 좋아요 여부 조회
 * - `POST   /post/:postId/like`     좋아요 등록
 * - `DELETE /post/:postId/like`     좋아요 취소
 */
@Controller('post')
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly tagService: TagService,
  ) {}

  /**
   * 포스트를 생성한다.
   *
   * @remarks
   * 태그는 `TagService.findOrCreateMany`로 기존 태그를 재사용하거나 신규 생성한다.
   * 전체 로직은 `TransactionInterceptor`가 주입한 `QueryRunner` 트랜잭션 내에서 처리된다.
   *
   * @param req  - 인증된 사용자 정보 및 `QueryRunner`가 주입된 요청 객체
   * @param post - 포스트 본문 DTO 및 태그 이름 배열
   * @returns 생성된 포스트와 리다이렉트용 `callbackUrl` (`/@{userId}{path}`)
   * @throws {ConflictException} 동일 사용자의 동일 URL(path) 중복 등록 시 (unique 위반)
   * @throws {BadRequestException} 그 외 포스트 생성 중 오류 발생 시
   */
  @Post()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(TransactionInterceptor)
  async createPost(
    @Req() req: IRequest,
    @Body() post: CreatePostDto & { tags: string[] },
  ) {
    const { qr, user, pendingSearchEvents } = req as unknown as {
      qr: QueryRunner;
      user: { user_id: string };
      pendingSearchEvents: PostSyncEvent[];
    };
    try {
      const tags = await this.tagService.findOrCreateMany(post.tags ?? [], qr);
      const newPost: PostModel = await this.postService.create(
        { ...post, user_id: user.user_id, tags },
        qr,
        pendingSearchEvents,
      );

      const callbackUrl = `/@${user.user_id}${newPost.path}`;
      return { post: newPost, callbackUrl };
    } catch (e: unknown) {
      if (
        e instanceof QueryFailedError &&
        (e.driverError as { code?: string }).code ===
          DB_ERROR_CODE.UNIQUE_VIOLATION
      ) {
        throw new ConflictException('이미 동일한 URL의 포스트가 존재합니다.');
      }
      throw new BadRequestException('포스트 등록 중 오류가 발생하였습니다.');
    }
  }

  /**
   * 포스트를 경로 기반으로 삭제한다.
   *
   * @remarks
   * 본인 포스트만 삭제할 수 있으며, 트랜잭션 내에서 처리된다.
   *
   * @param req    - 인증된 사용자 정보 및 `QueryRunner`
   * @param postId - 포스트의 ID
   * @returns 삭제 처리 결과
   *
   * @todo 실제 삭제 로직 구현 (현재 stub)
   */
  @Delete(':postId')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(TransactionInterceptor)
  async deletePost(@Req() req: IRequest, @Param('postId') postId: string) {
    const { qr, user, pendingSearchEvents } = req as unknown as {
      qr: QueryRunner;
      user: { user_id: string };
      pendingSearchEvents: PostSyncEvent[];
    };

    await this.postService.delete(
      postId,
      user.user_id,
      qr,
      pendingSearchEvents,
    );
    return { status: 'ok' };
  }

  /**
   * 팔로우한 사용자의 포스트를 최신순으로 조회한다.
   *
   * @param cursor - 마지막으로 조회한 포스트 ID (0이면 처음부터)
   * @param req    - 인증된 사용자 정보
   * @returns 커서 페이지네이션 결과
   */
  @Get('following')
  @UseGuards(AccessTokenGuard)
  getFollowingFeed(
    @Query('cursor') cursor: string | undefined,
    @Req() req: IRequest,
  ) {
    return this.postService.getFollowingFeed(
      { cursor: cursor ?? null, take: 10 },
      req.user.id,
    );
  }

  /**
   * 포스트 목록을 커서 페이지네이션으로 조회한다.
   *
   * @remarks
   * 인증은 선택이며, 로그인 상태인 경우 현재 사용자의 좋아요 여부 등
   * 개인화된 필드를 함께 내려준다. 페이지 크기는 10으로 고정한다.
   *
   * @param cursor - 마지막으로 조회한 포스트 ID (0이면 처음부터)
   * @param userId - 특정 사용자의 포스트만 조회할 때 지정
   * @param req    - 인증된 사용자 정보 (선택)
   * @returns 커서 페이지네이션 결과 (`{ data, hasNext, cursor, count }`)
   */
  @Get()
  @UseGuards(OptionalAccessTokenGuard)
  getPosts(
    @Query('cursor') cursor: string | undefined,
    @Query('userId') userId: string,
    @Req() req: IRequest,
  ) {
    return this.postService.getPosts(
      { cursor: cursor ?? null, userId, take: 10 },
      req.user?.user_id,
    );
  }

  /**
   * UUID로 포스트를 단건 조회한다.
   *
   * @remarks
   * 포스트 수정 페이지 진입 시 기존 데이터를 불러오는 용도로 사용한다.
   * 본인 포스트만 조회할 수 있으며, 다른 사용자의 포스트 ID를 전달하면 404를 반환한다.
   *
   * @param id  - 조회할 포스트 UUID
   * @param req - 인증된 사용자 정보
   * @returns 포스트 상세 정보
   * @throws {NotFoundException} 포스트가 존재하지 않거나 본인 포스트가 아닌 경우
   */
  @Get(':id')
  @UseGuards(AccessTokenGuard)
  findById(@Param('id', ParseUUIDPipe) id: string, @Req() req: IRequest) {
    return this.postService.findById(id, req.user.user_id);
  }

  /**
   * 포스트를 수정한다.
   *
   * @remarks
   * 본인 포스트만 수정할 수 있다.
   * 태그는 `TagService.findOrCreateMany`로 기존 태그를 재사용하거나 신규 생성한다.
   * 전체 로직은 `TransactionInterceptor`가 주입한 `QueryRunner` 트랜잭션 내에서 처리된다.
   *
   * @param req  - 인증된 사용자 정보 및 `QueryRunner`
   * @param id   - 수정할 포스트 UUID
   * @param post - 수정할 포스트 본문 DTO 및 태그 이름 배열
   * @returns 수정된 포스트와 리다이렉트용 `callbackUrl`
   * @throws {ConflictException} 동일 사용자의 동일 URL(path) 중복 시
   * @throws {NotFoundException} 포스트가 존재하지 않거나 본인 포스트가 아닌 경우
   */
  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(TransactionInterceptor)
  async updatePost(
    @Req() req: IRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() post: UpdatePostDto & { tags: string[] },
  ) {
    const { qr, user, pendingSearchEvents } = req as unknown as {
      qr: QueryRunner;
      user: { user_id: string };
      pendingSearchEvents: PostSyncEvent[];
    };
    try {
      const tags = await this.tagService.findOrCreateMany(post.tags ?? [], qr);
      const updatedPost = await this.postService.update(
        id,
        user.user_id,
        { ...post, tags },
        qr,
        pendingSearchEvents,
      );
      const callbackUrl = `/@${user.user_id}${updatedPost.path}`;
      return { post: updatedPost, callbackUrl };
    } catch (e: unknown) {
      if (
        e instanceof QueryFailedError &&
        (e.driverError as { code?: string }).code ===
          DB_ERROR_CODE.UNIQUE_VIOLATION
      ) {
        throw new ConflictException('이미 동일한 URL의 포스트가 존재합니다.');
      }
      throw new BadRequestException('포스트 수정 중 오류가 발생하였습니다.');
    }
  }

  /**
   * 단일 포스트를 경로 기반으로 조회한다.
   *
   * @remarks
   * 인증은 선택이며, 로그인 상태인 경우 좋아요 여부 등 개인화 필드를 포함한다.
   *
   * @param userId - 포스트 작성자의 user_id
   * @param path   - 포스트 URL path
   * @param req    - 인증된 사용자 정보 (선택)
   * @returns 단일 포스트 상세 정보
   */
  @Get(':userId/:path')
  @UseGuards(OptionalAccessTokenGuard)
  getPost(
    @Param('userId') userId: string,
    @Param('path') path: string,
    @Req() req: IRequest,
  ) {
    return this.postService.getPost(userId, path, req.user?.user_id);
  }

  /**
   * 현재 로그인한 사용자가 해당 포스트에 좋아요를 눌렀는지 조회한다.
   *
   * @param postId - 대상 포스트 ID
   * @param req    - 인증된 사용자 정보
   * @returns 좋아요 여부 및 관련 메타데이터
   */
  @Get(':postId/like/me')
  @UseGuards(AccessTokenGuard)
  getLikeById(@Param('postId') postId: string, @Req() req: IRequest) {
    return this.postService.getLike(postId, req.user.id);
  }

  /**
   * 포스트에 좋아요를 등록한다.
   *
   * @param req    - 인증된 사용자 정보 및 `QueryRunner`
   * @param postId - 대상 포스트 ID
   * @returns 좋아요 등록 결과
   */
  @Post(':postId/like')
  @UseGuards(AccessTokenGuard)
  createLike(@Req() req: IRequest, @Param('postId') postId: string) {
    return this.postService.doLike(req.user, postId, true);
  }

  /**
   * 포스트의 좋아요를 취소한다.
   *
   * @param req    - 인증된 사용자 정보 및 `QueryRunner`
   * @param postId - 대상 포스트 ID
   * @returns 좋아요 취소 결과
   */
  @Delete(':postId/like')
  @UseGuards(AccessTokenGuard)
  deleteLike(@Req() req: IRequest, @Param('postId') postId: string) {
    return this.postService.doLike(req.user, postId, false);
  }
}
