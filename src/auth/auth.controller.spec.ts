import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BlogService } from '../blog/blog.service';
import { UpdateUserDto } from './dto/update-user-dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings-dto';
import { ThemeEnum } from './entity/user_settings.entity';
import { DataSource } from 'typeorm';

const mockAuthService = () => ({
  getUserByEmail: jest.fn(),
  signIn: jest.fn(),
  signInWithCredentials: jest.fn(),
  getAllUser: jest.fn(),
  getUser: jest.fn(),
  hasUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  updateSettings: jest.fn(),
  withdrawUser: jest.fn(),
});

const mockBlogService = () => ({
  createBlog: jest.fn(),
});

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof mockAuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useFactory: mockAuthService },
        { provide: BlogService, useFactory: mockBlogService },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  const mockReq = (userId: string) => ({ tokenInfo: { userId } }) as any;

  // ──────────────────────────────────────────
  // PATCH /auth/users/:userId
  // ──────────────────────────────────────────
  describe('updateUser', () => {
    it('authService.updateUser를 올바른 인자로 호출한다', async () => {
      const dto: UpdateUserDto = {
        user_name: '새이름',
        socials: { github: 'https://github.com/test' },
      };
      const expectedResult = { id: 'uuid-1', user_name: '새이름' };
      authService.updateUser.mockResolvedValue(expectedResult);

      const result = await controller.updateUser(
        'testuser',
        dto,
        mockReq('testuser'),
      );

      expect(authService.updateUser).toHaveBeenCalledWith('testuser', dto);
      expect(result).toEqual(expectedResult);
    });
  });

  // ──────────────────────────────────────────
  // PATCH /auth/users/:userId/settings
  // ──────────────────────────────────────────
  describe('updateSettings', () => {
    it('authService.updateSettings를 올바른 인자로 호출한다', async () => {
      const dto: UpdateUserSettingsDto = {
        theme: ThemeEnum.dark,
        comment_notification: true,
        update_notification: false,
      };
      const expectedResult = { id: 'settings-uuid-1', ...dto };
      authService.updateSettings.mockResolvedValue(expectedResult);

      const result = await controller.updateSettings(
        'testuser',
        dto,
        mockReq('testuser'),
      );

      expect(authService.updateSettings).toHaveBeenCalledWith('testuser', dto);
      expect(result).toEqual(expectedResult);
    });

    it('extra 필드를 포함한 설정을 전달한다', async () => {
      const dto: UpdateUserSettingsDto = {
        extra: { featureFlag: true },
      };
      authService.updateSettings.mockResolvedValue(dto);

      await controller.updateSettings('testuser', dto, mockReq('testuser'));

      expect(authService.updateSettings).toHaveBeenCalledWith('testuser', dto);
    });
  });

  // ──────────────────────────────────────────
  // DELETE /auth/users/me
  // ──────────────────────────────────────────
  describe('withdrawMe', () => {
    it('authService.withdrawUser를 토큰의 userId로 호출한다', async () => {
      const expectedResult = { success: true };
      authService.withdrawUser.mockResolvedValue(expectedResult);

      const result = await controller.withdrawMe(mockReq('testuser'));

      expect(authService.withdrawUser).toHaveBeenCalledWith('testuser');
      expect(result).toEqual({ success: true });
    });
  });
});
