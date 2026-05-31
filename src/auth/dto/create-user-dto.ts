import { UserModel } from '../entity/user.entity';
import { PickType } from '@nestjs/swagger';

export class CreateUserDto extends PickType(UserModel, [
  'avatar_url',
  'provider',
  'user_id',
  'email',
]) {
  user_name?: string;
  password?: string;
}
