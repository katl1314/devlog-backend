import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { Request } from 'express';

interface IRequest extends Request {
  user?: any; // 실제 프로젝트에선 User 엔티티 타입을 사용하세요
  tokenInfo?: TokenPayload;
  tokenType?: string;
}

export interface TokenPayload {
  id: string;
  name: string;
  email: string;
  image: string;
  type: string;
  userId: string;
  tokenVersion: number;
}

@Injectable()
abstract class BearerTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  abstract readonly expectedTokenType: 'access' | 'refresh';

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IRequest>();
    const rawToken = req.headers.authorization;

    if (!rawToken) {
      throw new UnauthorizedException('토큰이 유효하지 않습니다.');
    }

    try {
      const token = this.authService.extractTokenFromHeader(rawToken, true); // 토큰을 가져온다.
      const tokenInfo = this.authService.verifyToken(token) as TokenPayload;

      if (tokenInfo.type !== this.expectedTokenType) {
        throw new UnauthorizedException(
          `${this.expectedTokenType} 토큰이 아닙니다.`,
        );
      }

      const user = await this.authService.getUser(tokenInfo.userId);

      if (user.token_version !== tokenInfo.tokenVersion) {
        throw new UnauthorizedException('토큰이 만료되었습니다.');
      }

      req.tokenInfo = tokenInfo;
      req.tokenType = tokenInfo.type;
      req.user = user;
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }
}

@Injectable()
export class AccessTokenGuard extends BearerTokenGuard {
  readonly expectedTokenType = 'access' as const;
}

@Injectable()
export class RefreshTokenGuard extends BearerTokenGuard {
  readonly expectedTokenType = 'refresh' as const;
}

@Injectable()
export class OptionalAccessTokenGuard extends BearerTokenGuard {
  readonly expectedTokenType = 'access' as const;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IRequest>();
    if (!req.headers.authorization) return true;
    return super.canActivate(context);
  }
}
