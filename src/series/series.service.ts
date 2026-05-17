import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeriesModel } from './entity/series.entity';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';

@Injectable()
export class SeriesService {
  constructor(
    @InjectRepository(SeriesModel)
    private readonly seriesRepository: Repository<SeriesModel>,
  ) {}

  async findByUserId(userId: string): Promise<SeriesModel[]> {
    return this.seriesRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<SeriesModel> {
    const series = await this.seriesRepository.findOne({ where: { id } });
    if (!series) throw new NotFoundException();
    return series;
  }

  async findPostsBySeries(id: string) {
    const series = await this.seriesRepository.findOne({
      where: { id },
      relations: { posts: { tags: true } },
      order: { posts: { series_order: 'ASC' } },
    });
    if (!series) throw new NotFoundException();
    return series.posts;
  }

  async create(userId: string, dto: CreateSeriesDto): Promise<SeriesModel> {
    const series = this.seriesRepository.create({ ...dto, user_id: userId });
    return this.seriesRepository.save(series);
  }

  async update(id: string, userId: string, dto: UpdateSeriesDto): Promise<SeriesModel> {
    const series = await this.findOne(id);
    if (series.user_id !== userId) throw new ForbiddenException();
    Object.assign(series, dto);
    return this.seriesRepository.save(series);
  }

  async remove(id: string, userId: string): Promise<void> {
    const series = await this.findOne(id);
    if (series.user_id !== userId) throw new ForbiddenException();
    await this.seriesRepository.remove(series);
  }
}
