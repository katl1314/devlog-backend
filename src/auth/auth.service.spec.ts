import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserModel, StatusEnum } from './entity/user.entity';
import { UserSettingsModel, ThemeEnum } from './entity/user_settings.entity';
import { UserFollowModel } from './entity/user_follow.entity';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user-dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings-dto';

const mockUser = (): UserModel =>
  ({
    id: 'uuid-1',
    user_id: 'testuser',
    user_name: '테스트',
    email: 'test@test.com',
    avatar_url: '',
    description: null,
    socials: null,
    status: StatusEnum.active,
  }) as UserModel;

const mockSettings = (): UserSettingsModel =>
  ({
    id: 'settings-uuid-1',
    theme: ThemeEnum.system,
    comment_notification: true,
    update_notification: true,
    extra: {},
  }) as UserSettingsModel;

const mockAuthRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  exists: jest.fn(),
});

const mockSettingsRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockFollowRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  exists: jest.fn(),
  count: jest.fn(),
  remove: jest.fn(),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let authRepo: ReturnType<typeof mockAuthRepository>;
  let settingsRepo: ReturnType<typeof mockSettingsRepository>;
  let dataSource: ReturnType<typeof mockDataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserModel), useFactory: mockAuthRepository },
        { provide: getRepositoryToken(UserSettingsModel), useFactory: mockSettingsRepository },
        { provide: getRepositoryToken(UserFollowModel), useFactory: mockFollowRepository },
        { provide: JwtService, useValue: { verify: jest.fn(), signAsync: jest.fn() } },
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    authRepo = module.get(getRepositoryToken(UserModel));
    settingsRepo = module.get(getRepositoryToken(UserSettingsModel));
    dataSource = module.get(DataSource);
  });

  // ──────────────────────────────────────────
  // updateUser
  // ──────────────────────────────────────────
  describe('updateUser', () => {
    it('존재하지 않는 userId이면 NotFoundException을 던진다', async () => {
      authRepo.findOne.mockResolvedValue(null);

      await expect(service.updateUser('unknown', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('user_name을 업데이트하면 저장된 유저를 반환한다', async () => {
      const user = mockUser();
      const dto: UpdateUserDto = { user_name: '변경된이름' };
      authRepo.findOne.mockResolvedValue(user);
      authRepo.save.mockResolvedValue({ ...user, ...dto });

      const result = await service.updateUser('testuser', dto);

      expect(authRepo.save).toHaveBeenCalledWith({ ...user, ...dto });
      expect(result.user_name).toBe('변경된이름');
    });

    it('socials를 업데이트하면 저장된 유저를 반환한다', async () => {
      const user = mockUser();
      const dto: UpdateUserDto = {
        socials: { github: 'https://github.com/test', twitter: '' },
      };
      authRepo.findOne.mockResolvedValue(user);
      authRepo.save.mockResolvedValue({ ...user, ...dto });

      const result = await service.updateUser('testuser', dto);

      expect(result.socials).toEqual(dto.socials);
    });
  });

  // ──────────────────────────────────────────
  // updateSettings
  // ──────────────────────────────────────────
  describe('updateSettings', () => {
    it('존재하지 않는 userId이면 NotFoundException을 던진다', async () => {
      authRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateSettings('unknown', { theme: ThemeEnum.dark }),
      ).rejects.toThrow(NotFoundException);
    });

    it('설정이 없으면 새로 생성한다', async () => {
      const user = mockUser();
      const dto: UpdateUserSettingsDto = {
        theme: ThemeEnum.dark,
        comment_notification: false,
        update_notification: true,
      };
      const createdSettings = { ...mockSettings(), ...dto, user };

      authRepo.findOne.mockResolvedValue(user);
      settingsRepo.findOne.mockResolvedValue(null);
      settingsRepo.create.mockReturnValue(createdSettings);
      settingsRepo.save.mockResolvedValue(createdSettings);

      const result = await service.updateSettings('testuser', dto);

      expect(settingsRepo.create).toHaveBeenCalledWith({ user, ...dto });
      expect(settingsRepo.save).toHaveBeenCalled();
      expect(result.theme).toBe(ThemeEnum.dark);
    });

    it('설정이 있으면 기존 설정을 업데이트한다', async () => {
      const user = mockUser();
      const existing = mockSettings();
      const dto: UpdateUserSettingsDto = {
        theme: ThemeEnum.light,
        update_notification: false,
      };

      authRepo.findOne.mockResolvedValue(user);
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.save.mockResolvedValue({ ...existing, ...dto });

      const result = await service.updateSettings('testuser', dto);

      expect(settingsRepo.create).not.toHaveBeenCalled();
      expect(settingsRepo.save).toHaveBeenCalledWith({ ...existing, ...dto });
      expect(result.theme).toBe(ThemeEnum.light);
    });

    it('extra 필드에 임의의 값을 저장할 수 있다', async () => {
      const user = mockUser();
      const existing = mockSettings();
      const dto: UpdateUserSettingsDto = {
        extra: { customKey: 'customValue', featureFlag: true },
      };

      authRepo.findOne.mockResolvedValue(user);
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.save.mockResolvedValue({ ...existing, ...dto });

      const result = await service.updateSettings('testuser', dto);

      expect(result.extra).toEqual(dto.extra);
    });
  });

  // ──────────────────────────────────────────
  // withdrawUser
  // ──────────────────────────────────────────
  describe('withdrawUser', () => {
    it('존재하지 않는 userId이면 NotFoundException을 던진다', async () => {
      authRepo.findOne.mockResolvedValue(null);

      await expect(service.withdrawUser('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('탈퇴 처리 후 { success: true }를 반환한다', async () => {
      const user = mockUser();
      authRepo.findOne.mockResolvedValue(user);
      dataSource.transaction.mockResolvedValue(undefined);

      const result = await service.withdrawUser('testuser');

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });
});
