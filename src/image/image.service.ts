import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImageModel } from './entity/image.entity';
import {
  STORAGE_BUCKET_IMAGES,
  STORAGE_SERVICE,
  StorageInterface,
} from 'src/storage/storage.interface';

@Injectable()
export class ImageService {
  constructor(
    @InjectRepository(ImageModel)
    private readonly imageRepository: Repository<ImageModel>,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageInterface,
  ) {}

  async upload(userId: string, file: Express.Multer.File): Promise<string> {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('이미지 파일만 업로드 가능합니다.');
    }

    const extension =
      file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';

    const image = this.imageRepository.create({
      user_id: userId,
      original_name: file.originalname,
      mime_type: file.mimetype,
      extension,
      size: file.size,
      is_uploaded: false,
    });
    await this.imageRepository.save(image);

    const key = `${image.id}.${extension}`;
    await this.storageService.upload(
      STORAGE_BUCKET_IMAGES,
      key,
      file.buffer,
      file.mimetype,
    );

    await this.imageRepository.update(image.id, { is_uploaded: true });

    return key;
  }

  async getBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    return await this.storageService.getBuffer(STORAGE_BUCKET_IMAGES, key);
  }
}
