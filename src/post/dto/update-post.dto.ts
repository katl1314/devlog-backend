import { PickType } from '@nestjs/swagger';
import { PostModel } from '../entity/post.entity';

export class UpdatePostDto extends PickType(PostModel, [
  'title',
  'content',
  'summary',
  'thumbnail',
  'visibility',
  'series_id',
]) {}
