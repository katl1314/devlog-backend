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
  cursor: number;
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
    if (dto.cursor && dto.cursor > 0) {
      if (Array.isArray(where)) {
        where = where.map((w) => ({ ...w, id: LessThan(dto.cursor) }));
      } else {
        where = { ...where, id: LessThan(dto.cursor) };
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
        id: 'DESC', // 최신순
      },
      where,
    };

    const posts = await repository.find(options);

    const hasNext = posts.length > dto.take; // 다음 아이템 여부
    const data = posts.slice(0, dto.take);

    // 마지막 아이템의 ID를 다음 커서로 지정 (hasNext가 true일 때만)
    const lastItem = data.length > 0 ? data[data.length - 1] : null;

    return {
      data,
      hasNext,
      cursor: {
        after: hasNext ? lastItem?.id : null,
      },
      count: data.length,
    };
  }
}
