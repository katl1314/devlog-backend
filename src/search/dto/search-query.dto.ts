import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const Q_PATTERN = /^[^\p{Cc}<>{}()|\\^`"]+$/u;

export class SearchQueryDto {
  @IsString()
  @MinLength(1, { message: '검색어를 입력해주세요.' })
  @MaxLength(100, { message: '올바르지 않은 검색어입니다.' })
  @Matches(Q_PATTERN, { message: '올바르지 않은 검색어입니다.' })
  q: string;

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  take?: number = 10;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class SuggestQueryDto {
  @IsString()
  @MinLength(1, { message: '검색어를 입력해주세요.' })
  @MaxLength(100, { message: '올바르지 않은 검색어입니다.' })
  @Matches(Q_PATTERN, { message: '올바르지 않은 검색어입니다.' })
  q: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
