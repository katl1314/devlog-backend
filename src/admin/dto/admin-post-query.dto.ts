import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { AdminPaginationDto } from './admin-pagination.dto';
import { Transform } from 'class-transformer';

export class AdminPostQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  visibility?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}
