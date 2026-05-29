import { Injectable } from '@nestjs/common';
import {
  FindManyOptions,
  Repository,
  FindOptionsWhere,
  LessThan,
  FindOptionsRelations,
} from 'typeorm';
import { PostModel } from '../post/entity/post.entity';

export interface PaginateProps {
  cursor: string | null;
  take: number;
}

@Injectable()
export class CommonService {
  paginate(
    dto: PaginateProps,
    repository: Repository<PostModel>,
    where: FindOptionsWhere<PostModel> | FindOptionsWhere<PostModel>[] = {},
    relations: FindOptionsRelations<PostModel> = {},
  ) {
    // 커서 기반
    return this.cursorPaginate(dto, repository, where, relations);
  }

  private async cursorPaginate(
    dto: PaginateProps,
    repository: Repository<PostModel>,
    where: FindOptionsWhere<PostModel> | FindOptionsWhere<PostModel>[] = {},
    relations: FindOptionsRelations<PostModel> = {},
  ) {
    // 1. Where 조건 동적 생성
    if (dto.cursor) {
      const cursorDate = new Date(dto.cursor);
      if (!isNaN(cursorDate.getTime())) {
        if (Array.isArray(where)) {
          where = where.map((w) => ({ ...w, created_at: LessThan(cursorDate) }));
        } else {
          where = { ...where, created_at: LessThan(cursorDate) };
        }
      }
    }

    const options: FindManyOptions<PostModel> = {
      relations: {
        user: {
          blog: true,
        },
        tags: true,
        ...relations,
      },
      take: dto.take + 1,
      order: {
        created_at: 'DESC',
        id: 'DESC',
      },
      where,
    };

    const posts = await repository.find(options);

    const hasNext = posts.length > dto.take;
    const data = posts.slice(0, dto.take);

    const lastItem = data.length > 0 ? data[data.length - 1] : null;

    return {
      data,
      hasNext,
      cursor: {
        after: hasNext ? (lastItem?.created_at?.toISOString() ?? null) : null,
      },
      count: data.length,
    };
  }
}
