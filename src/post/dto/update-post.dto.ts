import { PickType } from '@nestjs/mapped-types';
import { PostModel } from '../entity/post.entity';

export class UpdatePostDto extends PickType(PostModel, [
  'title',
  'path',
  'summary',
  'thumbnail',
  'visibility',
  'series_id',
]) {}
