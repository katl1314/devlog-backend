import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import {
  AccessTokenGuard,
  TokenPayload,
} from '../auth/guard/bearer-token.guard';

/**
 * 시리즈 API 컨트롤러.
 *
 * [공개]
 * - GET /series/user/:userId   유저 시리즈 목록
 * - GET /series/:id            시리즈 상세
 * - GET /series/:id/posts      시리즈 내 포스트 목록
 *
 * [인증 필요]
 * - POST   /series             시리즈 생성
 * - PATCH  /series/:id         시리즈 수정
 * - DELETE /series/:id         시리즈 삭제 (포스트 series_id → null)
 */
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.seriesService.findByUserId(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Get(':id/posts')
  findPosts(@Param('id') id: string) {
    return this.seriesService.findPostsBySeries(id);
  }

  @Post()
  @UseGuards(AccessTokenGuard)
  create(
    @Body() dto: CreateSeriesDto,
    @Req() req: Request & { tokenInfo: TokenPayload },
  ) {
    return this.seriesService.create(req.tokenInfo.userId, dto);
  }

  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSeriesDto,
    @Req() req: Request & { tokenInfo: TokenPayload },
  ) {
    return this.seriesService.update(id, req.tokenInfo.userId, dto);
  }

  @Delete(':id')
  @UseGuards(AccessTokenGuard)
  remove(
    @Param('id') id: string,
    @Req() req: Request & { tokenInfo: TokenPayload },
  ) {
    return this.seriesService.remove(id, req.tokenInfo.userId);
  }
}
