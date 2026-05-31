import { PartialType, PickType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { UserModel } from '../entity/user.entity';

export class UpdateUserDto extends PartialType(
  PickType(UserModel, [
    'user_name',
    'avatar_url',
    'description',
    'socials',
  ] as const),
) {
  @IsOptional()
  @IsString()
  blog_description?: string;
}
