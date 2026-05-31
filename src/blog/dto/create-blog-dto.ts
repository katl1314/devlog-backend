import { PickType } from '@nestjs/swagger';
import { BlogModel } from '../entity/blog.entity';

export class CreateBlogDTO extends PickType(BlogModel, [
  'user',
  'title',
  'description',
]) {}
