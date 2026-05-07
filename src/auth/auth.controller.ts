import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TransactionInterceptor } from '../common/interceptor/transaction.interceptor';
import { CreateBlogDTO } from '../blog/dto/create-blog-dto';
import { CreateUserDto } from './dto/create-user-dto';
import { UpdateUserDto } from './dto/update-user-dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings-dto';
import { BlogService } from '../blog/blog.service';
import { AuthService } from './auth.service';
import { QueryRunner } from 'typeorm';
import {
  AccessTokenGuard,
  RefreshTokenGuard,
  TokenPayload,
} from './guard/bearer-token.guard';
import { ProviderEnum } from './entity/user.entity';

interface User {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  provider?: string;
}

/**
 * 인증 및 사용자 API 컨트롤러.
 *
 * @remarks
 * Base URL: `/auth`
 *
 * [공개]
 * - `POST   /auth/signIn`                  OAuth 프로필 기반 로그인 (토큰 발급)
 * - `POST   /auth/signIn/credentials`      이메일/비밀번호 로그인
 * - `POST   /auth/access`                  access token 갱신 (refresh token 필요)
 * - `POST   /auth/users`                   회원가입 + 블로그 생성 (트랜잭션)
 * - `GET    /auth/users`                   전체 사용자 목록 조회
 * - `GET    /auth/users/:userId`           사용자 단건 조회
 * - `GET    /auth/users/:email/exists`     이메일 가입 여부 확인
 * - `GET    /auth/users/email/:email`      이메일로 사용자 조회
 *
 * [인증 필요]
 * - `PATCH  /auth/users/:userId`           프로필 업데이트
 * - `GET    /auth/users/:userId/settings`  앱 설정 조회
 * - `PATCH  /auth/users/:userId/settings`  앱 설정 업데이트
 * - `DELETE /auth/users/:userId`           회원 탈퇴 (soft delete)
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly blogService: BlogService,
  ) {}

  /**
   * OAuth 프로필을 받아 로그인 처리 후 access/refresh 토큰을 발급한다.
   *
   * @remarks
   * 이메일로 기존 사용자를 조회해 `user_id`를 토큰 페이로드에 포함한다.
   *
   * @param payload - OAuth 프로필 (email 필수)
   * @returns `accessToken`, `refreshToken`, `userId`
   */
  @Post('signIn')
  async signIn(@Body() payload: User) {
    const user = await this.authService.getUserByEmail(payload.email!);
    if (payload.provider) {
      const incoming = payload.provider.toUpperCase() as ProviderEnum;
      if (incoming !== user.provider) {
        throw new ConflictException(`PROVIDER_MISMATCH:${user.provider}`);
      }
    }
    const { accessToken, refreshToken } = await this.authService.signIn({
      ...payload,
      userId: user.user_id,
    });
    return {
      accessToken,
      refreshToken,
      userId: user.user_id,
    };
  }

  /**
   * 이메일/비밀번호 조합으로 로그인하여 토큰을 발급한다.
   *
   * @remarks
   * 자격 검증 실패 시 `AuthService`에서 예외를 던진다.
   *
   * @param body - `email`과 `password`
   * @returns `accessToken`, `refreshToken`, `userId`
   */
  @Post('signIn/credentials')
  async signInWithCredentials(
    @Body() body: { email: string; password: string },
  ) {
    const user = await this.authService.signInWithCredentials(
      body.email,
      body.password,
    );
    const { accessToken, refreshToken } = await this.authService.signIn({
      email: user.email,
      name: user.user_name,
      image: user.avatar_url,
      userId: user.user_id,
    });
    return { accessToken, refreshToken, userId: user.user_id };
  }

  /**
   * refresh token을 검증한 뒤 새로운 access token을 발급한다.
   *
   * @remarks
   * `RefreshTokenGuard`가 토큰을 검증하여 `req.tokenInfo`에 페이로드를 주입한다.
   *
   * @param req - `tokenInfo`가 주입된 요청 객체
   * @returns 갱신된 access token
   */
  @Post('access')
  @UseGuards(RefreshTokenGuard)
  async rotateAccessToken(@Req() req: Request & { tokenInfo: TokenPayload }) {
    return await this.authService.rotateToken(req);
  }

  /**
   * 전체 사용자 목록을 반환한다.
   *
   * @returns 사용자 배열
   */
  @Get('users')
  getAllUser() {
    return this.authService.getAllUser();
  }

  /**
   * `user_id`로 단일 사용자를 조회한다.
   *
   * @param userId - 조회할 사용자 ID
   * @returns 사용자 정보
   */
  @Get('users/:userId')
  getUser(@Param('userId') userId: string) {
    return this.authService.getUser(userId);
  }

  /**
   * 이메일로 가입된 사용자가 존재하는지 확인한다.
   *
   * @param email - 확인할 이메일
   * @returns 가입 여부 (boolean)
   */
  @Get('users/:email/exists')
  hasUserByEmail(@Param('email') email: string) {
    return this.authService.hasUser(email);
  }

  /**
   * 이메일로 사용자 정보를 조회한다.
   *
   * @param email - 조회할 이메일
   * @returns 사용자 정보
   */
  @Get('users/email/:email')
  getUserByEmail(@Param('email') email: string) {
    return this.authService.getUserByEmail(email);
  }

  /**
   * 사용자 프로필을 부분 업데이트한다.
   *
   * @remarks
   * 업데이트 가능 필드: `user_name`, `avatar_url`, `description`, `socials`.
   *
   * @param userId - 업데이트할 사용자 ID
   * @param dto    - 부분 업데이트 필드
   * @returns 업데이트된 사용자 정보
   */
  @Patch('users/:userId')
  @UseGuards(AccessTokenGuard)
  updateUser(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(userId, dto);
  }

  /**
   * 사용자 앱 설정을 조회한다.
   *
   * @param userId - 대상 사용자 ID
   * @returns 앱 설정 객체
   */
  @Get('users/:userId/settings')
  @UseGuards(AccessTokenGuard)
  getSettings(@Param('userId') userId: string) {
    return this.authService.getSettings(userId);
  }

  /**
   * 사용자 앱 설정을 부분 업데이트한다.
   *
   * @remarks
   * 업데이트 가능 필드: `theme`, `notifications`, `extra`.
   *
   * @param userId - 대상 사용자 ID
   * @param dto    - 부분 업데이트 필드
   * @returns 업데이트된 설정 객체
   */
  @Patch('users/:userId/settings')
  @UseGuards(AccessTokenGuard)
  updateSettings(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserSettingsDto,
  ) {
    return this.authService.updateSettings(userId, dto);
  }

  /**
   * 회원 탈퇴를 처리한다.
   *
   * @remarks
   * 실제 행을 삭제하지 않고 `status`를 `WITHDRAWN`으로 변경하는 soft delete 방식이다.
   *
   * @param userId - 탈퇴할 사용자 ID
   * @returns 탈퇴 처리 결과
   */
  @Delete('users/:userId')
  @UseGuards(AccessTokenGuard)
  withdrawUser(@Param('userId') userId: string) {
    return this.authService.withdrawUser(userId);
  }

  /**
   * 특정 사용자를 팔로우한다.
   *
   * @param userId   - 팔로우할 대상 user_id
   * @param req      - tokenInfo가 주입된 요청 객체 (팔로워 정보 포함)
   * @returns `{ following: true }`
   */
  @Post('users/:userId/follow')
  @UseGuards(AccessTokenGuard)
  followUser(
    @Param('userId') userId: string,
    @Req() req: Request & { tokenInfo: TokenPayload },
  ) {
    return this.authService.followUser(req.tokenInfo.userId, userId);
  }

  /**
   * 특정 사용자를 언팔로우한다.
   *
   * @param userId   - 언팔로우할 대상 user_id
   * @param req      - tokenInfo가 주입된 요청 객체 (팔로워 정보 포함)
   * @returns `{ following: false }`
   */
  @Delete('users/:userId/follow')
  @UseGuards(AccessTokenGuard)
  unfollowUser(
    @Param('userId') userId: string,
    @Req() req: Request & { tokenInfo: TokenPayload },
  ) {
    return this.authService.unfollowUser(req.tokenInfo.userId, userId);
  }

  /**
   * 현재 로그인 유저가 대상 유저를 팔로우하고 있는지 확인한다.
   *
   * @param userId   - 확인할 대상 user_id
   * @param req      - tokenInfo가 주입된 요청 객체
   * @returns `{ following: boolean }`
   */
  @Get('users/:userId/follow/status')
  @UseGuards(AccessTokenGuard)
  getFollowStatus(
    @Param('userId') userId: string,
    @Req() req: Request & { tokenInfo: TokenPayload },
  ) {
    return this.authService.getFollowStatus(req.tokenInfo.userId, userId);
  }

  /**
   * 특정 유저의 팔로워/팔로잉 수를 반환한다.
   *
   * @param userId   - 조회할 user_id
   * @returns `{ followerCount: number, followingCount: number }`
   */
  @Get('users/:userId/follow/counts')
  getFollowCounts(@Param('userId') userId: string) {
    return this.authService.getFollowCounts(userId);
  }

  /**
   * 신규 사용자와 블로그를 동일 트랜잭션 내에서 함께 생성한다.
   *
   * @remarks
   * 사용자 생성 → 생성된 user 엔티티를 blog DTO에 주입 → 블로그 생성 순으로 진행한다.
   * 어느 단계든 실패하면 전체가 롤백된다.
   *
   * @param body - `user` DTO와 `blog` DTO
   * @param req  - `QueryRunner`가 주입된 요청 객체
   * @returns 생성된 `user`와 `blog`
   */
  @Post('users')
  @UseInterceptors(TransactionInterceptor)
  async postUser(
    @Body() body: { user: CreateUserDto; blog: CreateBlogDTO },
    @Req() req: Request & { qr: QueryRunner },
  ) {
    const user = await this.authService.createUser(body.user, req.qr);
    body.blog.user = user;
    const blog = await this.blogService.createBlog(body.blog, req.qr);
    return { user, blog };
  }
}
