import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user-dto';
import { UpdateUserDto } from './dto/update-user-dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings-dto';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { ProviderEnum, StatusEnum, UserModel } from './entity/user.entity';
import { UserSettingsModel } from './entity/user_settings.entity';
import { UserFollowModel } from './entity/user_follow.entity';
import { isEmpty } from '../common/util/util';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { TokenPayload } from './guard/bearer-token.guard';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserModel)
    private readonly authRepository: Repository<UserModel>,
    @InjectRepository(UserSettingsModel)
    private readonly settingsRepository: Repository<UserSettingsModel>,
    @InjectRepository(UserFollowModel)
    private readonly followRepository: Repository<UserFollowModel>,
    private readonly jwtService: JwtService,
  ) {}

  getRepository(qr?: QueryRunner) {
    return isEmpty(qr)
      ? this.authRepository
      : qr.manager.getRepository<UserModel>(UserModel);
  }

  async getAllUser() {
    return await this.authRepository.find({
      relations: {
        posts: true,
        blog: true,
      },
    });
  }

  async getUser(userId: string) {
    const user = await this.authRepository.findOne({
      where: {
        user_id: userId,
      },
      relations: {
        blog: true,
        followers: true,
        following: true,
      },
    });

    if (!user) {
      throw new NotFoundException();
    }

    return user;
  }

  async getUserByEmail(email: string) {
    const user = await this.authRepository.findOne({
      where: {
        email,
      },
      relations: {
        blog: true,
      },
    });
    if (!user) {
      throw new NotFoundException();
    }

    return user;
  }

  async hasUser(email: string) {
    return await this.authRepository.exists({
      where: {
        email,
      },
    });
  }

  async createUser(user: CreateUserDto, qr?: QueryRunner) {
    const authRepo = this.getRepository(qr);
    if (user.password) {
      user.password = await bcrypt.hash(user.password, 10);
    }
    const newUser = authRepo.create(user);
    await authRepo.save(newUser);
    return newUser;
  }

  async signInWithCredentials(email: string, password: string) {
    const user = await this.authRepository.findOne({
      where: { email, provider: ProviderEnum.email },
      select: ['id', 'email', 'user_id', 'user_name', 'avatar_url', 'password'],
    });

    if (!user || !user.password) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const { password: _, ...safeUser } = user;
    return safeUser as Omit<typeof user, 'password'>;
  }

  // 토큰 추출
  extractTokenFromHeader(token: string, isBearer: boolean = false) {
    const splitToken = token.split(' '); // 토큰을 공백 기준으로 나눈다.
    const prefix = isBearer ? 'Bearer' : 'Basic';
    if (splitToken.length !== 2 || splitToken[0] !== prefix) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    return splitToken[1];
  }

  // 토큰 검증
  verifyToken(token: string): unknown {
    try {
      return this.jwtService.verify(token, {
        secret: process.env.AUTH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('토큰이 유효하지 않습니다.');
    }
  }

  // 로그인
  async signIn(payload) {
    const accessToken = await this.signToken(payload);
    const refreshToken = await this.signToken(payload, true);
    return { accessToken, refreshToken };
  }

  // Access Token, Refresh Token 발급
  async signToken(payload, isRefreshToken: boolean = false) {
    return await this.jwtService.signAsync(
      {
        ...payload,
        type: isRefreshToken ? 'refresh' : 'access',
      },
      {
        secret: process.env.AUTH_SECRET,
        expiresIn: isRefreshToken ? 60 * 60 * 24 * 30 : 60 * 24 * 24,
      },
    );
  }

  async rotateToken(
    req: Request & { tokenInfo: TokenPayload },
    isRefreshToken: boolean = false,
  ) {
    const accessToken = await this.signToken(req.tokenInfo, isRefreshToken);
    return { accessToken };
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();
    Object.assign(user, dto);
    return await this.authRepository.save(user);
  }

  async getSettings(userId: string) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();

    const settings = await this.settingsRepository.findOne({
      where: { user: { id: user.id } },
    });

    return (
      settings ?? {
        theme: 'SYSTEM',
        comment_notification: true,
        update_notification: true,
      }
    );
  }

  async updateSettings(userId: string, dto: UpdateUserSettingsDto) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();

    let settings = await this.settingsRepository.findOne({
      where: { user: { id: user.id } },
    });

    if (!settings) {
      settings = this.settingsRepository.create({ user, ...dto });
    } else {
      Object.assign(settings, dto);
    }

    return await this.settingsRepository.save(settings);
  }

  async withdrawUser(userId: string) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();
    user.status = StatusEnum.withdrawn;
    return await this.authRepository.save(user);
  }

  async followUser(followerUserId: string, targetUserId: string) {
    if (followerUserId === targetUserId) {
      throw new BadRequestException('자기 자신을 팔로우할 수 없습니다.');
    }

    const [follower, target] = await Promise.all([
      this.authRepository.findOne({ where: { user_id: followerUserId } }),
      this.authRepository.findOne({ where: { user_id: targetUserId } }),
    ]);
    if (!follower || !target) throw new NotFoundException();

    const exists = await this.followRepository.exists({
      where: { follower_id: follower.id, following_id: target.id },
    });
    if (exists) throw new ConflictException('이미 팔로우하고 있습니다.');

    await this.followRepository.save(
      this.followRepository.create({
        follower_id: follower.id,
        following_id: target.id,
      }),
    );
    return { following: true };
  }

  async unfollowUser(followerUserId: string, targetUserId: string) {
    const [follower, target] = await Promise.all([
      this.authRepository.findOne({ where: { user_id: followerUserId } }),
      this.authRepository.findOne({ where: { user_id: targetUserId } }),
    ]);
    if (!follower || !target) throw new NotFoundException();

    const follow = await this.followRepository.findOne({
      where: { follower_id: follower.id, following_id: target.id },
    });
    if (!follow) {
      throw new NotFoundException('팔로우 관계가 존재하지 않습니다.');
    }
    await this.followRepository.remove(follow);
    return { following: false };
  }

  async getFollowStatus(followerUserId: string, targetUserId: string) {
    const [follower, target] = await Promise.all([
      this.authRepository.findOne({ where: { user_id: followerUserId } }),
      this.authRepository.findOne({ where: { user_id: targetUserId } }),
    ]);
    if (!follower || !target) return { following: false };

    const following = await this.followRepository.exists({
      where: { follower_id: follower.id, following_id: target.id },
    });
    return { following };
  }

  async getFollowCounts(userId: string) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();

    const [followerCount, followingCount] = await Promise.all([
      this.followRepository.count({ where: { following_id: user.id } }),
      this.followRepository.count({ where: { follower_id: user.id } }),
    ]);
    return { followerCount, followingCount };
  }

  async getFollowers(userId: string) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();

    const rows = await this.followRepository.find({
      where: { following_id: user.id },
      relations: { follower: true },
    });
    return rows.map(({ follower }) => ({
      user_id: follower.user_id,
      user_name: follower.user_name,
      avatar_url: follower.avatar_url,
    }));
  }

  async getFollowings(userId: string) {
    const user = await this.authRepository.findOne({
      where: { user_id: userId },
    });
    if (!user) throw new NotFoundException();

    const rows = await this.followRepository.find({
      where: { follower_id: user.id },
      relations: { following: true },
    });
    return rows.map(({ following }) => ({
      user_id: following.user_id,
      user_name: following.user_name,
      avatar_url: following.avatar_url,
    }));
  }
}
