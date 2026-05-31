import { PickType } from '@nestjs/swagger';
import { PostModel } from '../entity/post.entity';

export class CreatePostDto extends PickType(PostModel, [
  'user',
  'title',
  'path',
  'status',
  'summary',
  'thumbnail',
  'visibility',
  'series_id',
]) {}
