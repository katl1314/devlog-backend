import { IsOptional, IsString } from 'class-validator';
import { AdminPaginationDto } from './admin-pagination.dto';

export class AdminCommentQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
