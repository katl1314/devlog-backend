import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { TransactionInterceptor } from './interceptor/transaction.interceptor';

@Module({
  controllers: [CommonController],
  providers: [CommonService, TransactionInterceptor],
  exports: [CommonService, TransactionInterceptor],
})
export class CommonModule {}
