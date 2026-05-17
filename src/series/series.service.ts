import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeriesModel } from './entity/series.entity';
import { PostModel } from '../post/entity/post.entity';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';

@Injectable()
export class SeriesService {
  constructor(
    @InjectRepository(SeriesModel)
    private readonly seriesRepository: Repository<SeriesModel>,
    @InjectRepository(PostModel)
    private readonly postRepository: Repository<PostModel>,
  ) {}

  async findByUserId(userId: string): Promise<SeriesModel[]> {
    return this.seriesRepository
      .createQueryBuilder('series')
      .where('series.user_id = :userId', { userId })
      .loadRelationCountAndMap('series.post_count', 'series.posts')
      .orderBy('series.created_at', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<SeriesModel> {
    const series = await this.seriesRepository.findOne({ where: { id } });
    if (!series) throw new NotFoundException();
    return series;
  }

  async findPostsBySeries(id: string) {
    const exists = await this.seriesRepository.exists({ where: { id } });
    if (!exists) throw new NotFoundException();
    return this.postRepository.find({
      where: { series_id: id },
      relations: { user: { blog: true }, tags: true, likes: true, comments: true },
      order: { series_order: 'ASC' },
    });
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
