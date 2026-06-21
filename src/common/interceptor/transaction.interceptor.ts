import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { catchError, mergeMap, Observable } from 'rxjs';
import { DataSource, QueryRunner } from 'typeorm';
import { PostSyncEvent } from '../../types/express';

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TransactionInterceptor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Promise<Observable<any>> {
    const qr = this.dataSource.createQueryRunner();
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { qr: QueryRunner; pendingSearchEvents: PostSyncEvent[] }
      >();

    await qr.connect();
    await qr.startTransaction();
    request.qr = qr;
    request.pendingSearchEvents = [];

    return next.handle().pipe(
      mergeMap(async (data: unknown) => {
        await qr.commitTransaction();
        await qr.release();

        for (const event of request.pendingSearchEvents) {
          try {
            await this.eventEmitter.emitAsync('post.sync', event);
          } catch (e) {
            this.logger.error('search sync event emit 실패', {
              event,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return data;
      }),
      catchError((err: unknown) => {
        this.logger.error('intercept --- catchError');
        return new Observable((subscriber) => {
          qr.rollbackTransaction()
            .then(() => qr.release())
            .catch((releaseErr: unknown) =>
              this.logger.error('rollback 실패', releaseErr),
            )
            .finally(() => subscriber.error(err));
        });
      }),
    );
  }
}
