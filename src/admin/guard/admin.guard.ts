import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../auth/guard/bearer-token.guard';
import { UserRole } from '../../auth/entity/user.entity';

interface IRequest extends Request {
  user?: {
    role: any;
  };
}

@Injectable()
export class AdminGuard extends AccessTokenGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const req = context.switchToHttp().getRequest<IRequest>();
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('관리자 권한이 필요합니다.');
    }
    return true;
  }
}
