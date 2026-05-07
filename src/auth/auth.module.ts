import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModel } from './entity/user.entity';
import { UserSettingsModel } from './entity/user_settings.entity';
import { UserFollowModel } from './entity/user_follow.entity';
import { BlogModule } from '../blog/blog.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserModel, UserSettingsModel, UserFollowModel]),
    JwtModule.register({}),
    BlogModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
