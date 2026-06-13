import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface';
import { LocalStorage } from './local.storage';
import { ProdStorage } from './prod.storage';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: () =>
        process.env.SEAWEEDFS_ENDPOINT ? new LocalStorage() : new ProdStorage(),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
