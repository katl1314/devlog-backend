import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageModel } from './entity/image.entity';
import { ImageService } from './image.service';
import { ImageController } from './image.controller';
import { StorageModule } from 'src/storage/storage.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImageModel]),
    StorageModule,
    AuthModule,
  ],
  controllers: [ImageController],
  providers: [ImageService],
})
export class ImageModule {}
