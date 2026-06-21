import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './guard/admin.guard';
import { SearchAdminService } from '../search/search-admin.service';

@Controller('admin/search/reindex')
@UseGuards(AdminGuard)
export class SearchReindexController {
  constructor(private readonly searchAdminService: SearchAdminService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  triggerReindex(@Req() req: any) {
    return this.searchAdminService.triggerReindex(req.user?.user_id ?? 'system');
  }

  @Get(':jobId')
  getStatus(@Param('jobId') jobId: string) {
    return this.searchAdminService.getJobStatus(jobId);
  }
}
