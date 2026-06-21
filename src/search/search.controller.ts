import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto, SuggestQueryDto } from './dto/search-query.dto';

@Controller('posts/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('suggest')
  suggest(@Query() dto: SuggestQueryDto) {
    return this.searchService.suggest(dto);
  }

  @Get()
  search(@Query() dto: SearchQueryDto) {
    return this.searchService.search(dto);
  }
}
