import { PickType } from '@nestjs/mapped-types';
import { CommentModel } from '../entity/comment.entity';

export class UpdateCommentDto extends PickType(CommentModel, ['content']) {}
