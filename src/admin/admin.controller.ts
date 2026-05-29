import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './guard/admin.guard';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminPostQueryDto } from './dto/admin-post-query.dto';
import { AdminCommentQueryDto } from './dto/admin-comment-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  getUsers(@Query() dto: AdminUserQueryDto) {
    return this.adminService.getUsers(dto);
  }

  @Get('users/:id')
  getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteUser(id);
  }

  @Get('posts')
  getPosts(@Query() dto: AdminPostQueryDto) {
    return this.adminService.getPosts(dto);
  }

  @Get('posts/:id')
  getPostById(@Param('id') id: string) {
    return this.adminService.getPostById(id);
  }

  @Patch('posts/:id/visibility')
  togglePostVisibility(@Param('id') id: string) {
    return this.adminService.togglePostVisibility(id);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  deletePost(@Param('id') id: string) {
    return this.adminService.deletePost(id);
  }

  @Get('comments')
  getComments(@Query() dto: AdminCommentQueryDto) {
    return this.adminService.getComments(dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  deleteComment(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteComment(id);
  }
}
