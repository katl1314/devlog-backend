import { PartialType, PickType } from '@nestjs/swagger';
import { UserSettingsModel } from '../entity/user_settings.entity';

export class UpdateUserSettingsDto extends PartialType(
  PickType(UserSettingsModel, [
    'theme',
    'comment_notification',
    'update_notification',
    'extra',
  ] as const),
) {}
