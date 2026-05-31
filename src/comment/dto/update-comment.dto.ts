import { PickType } from '@nestjs/swagger';
import { CommentModel } from '../entity/comment.entity';

export class UpdateCommentDto extends PickType(CommentModel, ['content']) {}
