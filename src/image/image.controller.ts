import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AccessTokenGuard } from 'src/auth/guard/bearer-token.guard';
import { UserModel } from 'src/auth/entity/user.entity';
import { ImageService } from './image.service';
import { MulterExceptionFilter } from './multer-exception.filter';

interface IRequest {
  user: UserModel & { user_id: string };
}

@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadImage(
    @Req() req: IRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('이미지 파일이 없습니다.');
    const key = await this.imageService.upload(req.user.user_id, file);
    return { key };
  }

  @Get(':key')
  async getImage(@Param('key') key: string, @Res() res: Response) {
    const { buffer, contentType } = await this.imageService.getBuffer(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.end(buffer);
  }
}
