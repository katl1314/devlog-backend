import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AdminPaginationDto } from './admin-pagination.dto';
import { StatusEnum } from '../../auth/entity/user.entity';

export class AdminUserQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;
}
