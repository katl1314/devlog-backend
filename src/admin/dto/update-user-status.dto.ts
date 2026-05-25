import { IsEnum } from 'class-validator';
import { StatusEnum } from '../../auth/entity/user.entity';

export class UpdateUserStatusDto {
  @IsEnum([StatusEnum.active, StatusEnum.blocked])
  status: StatusEnum.active | StatusEnum.blocked;
}
