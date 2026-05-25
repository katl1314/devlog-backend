import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Like, Repository } from 'typeorm';
import { UserModel, StatusEnum } from '../auth/entity/user.entity';
import { PostModel } from '../post/entity/post.entity';
import { CommentModel } from '../comment/entity/comment.entity';
import { PostLikeModel } from '../post/entity/post_like.entity';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { AdminPostQueryDto } from './dto/admin-post-query.dto';
import { AdminCommentQueryDto } from './dto/admin-comment-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserModel)
    private readonly userRepo: Repository<UserModel>,
    @InjectRepository(PostModel)
    private readonly postRepo: Repository<PostModel>,
    @InjectRepository(CommentModel)
    private readonly commentRepo: Repository<CommentModel>,
    @InjectRepository(PostLikeModel)
    private readonly likeRepo: Repository<PostLikeModel>,
  ) {}

  async getDashboard() {
    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      withdrawnUsers,
      totalPosts,
      publishedPosts,
      draftPosts,
      totalComments,
      totalLikes,
    ] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { status: StatusEnum.active } }),
      this.userRepo.count({ where: { status: StatusEnum.blocked } }),
      this.userRepo.count({ where: { status: StatusEnum.withdrawn } }),
      this.postRepo.count({ withDeleted: false }),
      this.postRepo.count({ where: { status: 'published' }, withDeleted: false }),
      this.postRepo.count({ where: { status: 'draft' }, withDeleted: false }),
      this.commentRepo.count({ withDeleted: false }),
      this.likeRepo.count(),
    ]);

    return {
      totalUsers,
      activeUsers,
      blockedUsers,
      withdrawnUsers,
      totalPosts,
      publishedPosts,
      draftPosts,
      totalComments,
      totalLikes,
    };
  }

  async getUsers(dto: AdminUserQueryDto) {
    const { page = 1, take = 20, search, status } = dto;
    const skip = (page - 1) * take;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      return this.userRepo
        .createQueryBuilder('user')
        .where(status ? 'user.status = :status' : '1=1', { status })
        .andWhere(
          '(user.email ILIKE :search OR user.user_id ILIKE :search OR user.user_name ILIKE :search)',
          { search: `%${search}%` },
        )
        .orderBy('user.created_at', 'DESC')
        .skip(skip)
        .take(take)
        .getManyAndCount()
        .then(([data, total]) => this.paginate(data, total, page, take));
    }

    const [data, total] = await this.userRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    return this.paginate(data, total, page, take);
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없습니다.');

    const recentPosts = await this.postRepo.find({
      where: { user_id: user.user_id },
      order: { created_at: 'DESC' },
      take: 5,
    });

    return { ...user, recentPosts };
  }

  async updateUserStatus(id: string, dto: UpdateUserStatusDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없습니다.');

    await this.userRepo.update(id, { status: dto.status });
    return { id, status: dto.status };
  }

  async deleteUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없습니다.');

    await this.userRepo.update(id, {
      status: StatusEnum.withdrawn,
      deleted_at: new Date(),
    });
  }

  async getPosts(dto: AdminPostQueryDto) {
    const { page = 1, take = 20, search, visibility, status } = dto;
    const skip = (page - 1) * take;

    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .withDeleted()
      .orderBy('post.created_at', 'DESC')
      .skip(skip)
      .take(take);

    if (search) qb.andWhere('post.title ILIKE :search', { search: `%${search}%` });
    if (visibility !== undefined) qb.andWhere('post.visibility = :visibility', { visibility });
    if (status) qb.andWhere('post.status = :status', { status });

    const [data, total] = await qb.getManyAndCount();
    return this.paginate(data, total, page, take);
  }

  async getPostById(id: number) {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['user'],
      withDeleted: true,
    });
    if (!post) throw new NotFoundException('포스트를 찾을 수 없습니다.');
    return post;
  }

  async togglePostVisibility(id: number) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('포스트를 찾을 수 없습니다.');

    const visibility = !post.visibility;
    await this.postRepo.update(id, { visibility });
    return { id, visibility };
  }

  async deletePost(id: number) {
    const post = await this.postRepo.findOne({ where: { id }, withDeleted: true });
    if (!post) throw new NotFoundException('포스트를 찾을 수 없습니다.');

    await this.postRepo.delete(id);
  }

  async getComments(dto: AdminCommentQueryDto) {
    const { page = 1, take = 20, search } = dto;
    const skip = (page - 1) * take;

    const qb = this.commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .leftJoinAndSelect('comment.post', 'post')
      .withDeleted()
      .orderBy('comment.created_at', 'DESC')
      .skip(skip)
      .take(take);

    if (search) {
      qb.andWhere(
        '(comment.content ILIKE :search OR user.user_id ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return this.paginate(data, total, page, take);
  }

  async deleteComment(id: string) {
    const comment = await this.commentRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    await this.commentRepo.delete(id);
  }

  private paginate<T>(data: T[], total: number, page: number, take: number) {
    return {
      data,
      total,
      page,
      take,
      totalPages: Math.ceil(total / take),
    };
  }
}
