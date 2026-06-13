import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { OnModuleInit } from '@nestjs/common';
import {
  STORAGE_BUCKET_AVATARS,
  STORAGE_BUCKET_IMAGES,
  STORAGE_BUCKET_POST,
  StorageInterface,
} from './storage.interface';

export class LocalStorage implements StorageInterface, OnModuleInit {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.SEAWEEDFS_ENDPOINT,
      region: process.env.SEAWEEDFS_REGION,
      forcePathStyle: true, // SeaweedFS 필수 옵션
      credentials: {
        accessKeyId: process.env.SEAWEEDFS_ACCESS_KEY,
        secretAccessKey: process.env.SEAWEEDFS_SECRET_KEY,
      },
    });
  }

  async onModuleInit() {
    const buckets = [
      STORAGE_BUCKET_POST,
      STORAGE_BUCKET_IMAGES,
      STORAGE_BUCKET_AVATARS,
    ];
    for (const bucket of buckets) {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (e: unknown) {
        const storage = e as { name: string };
        if (
          storage.name !== 'BucketAlreadyExists' &&
          storage.name !== 'BucketAlreadyOwnedByYou'
        ) {
          throw e;
        }
      }
    }
  }

  async upload(
    bucket: string,
    key: string,
    body: string | Buffer,
    contentType = 'text/markdown; charset=utf-8',
  ) {
    return await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(bucket: string, key: string) {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return res.Body?.transformToString();
  }

  async delete(bucket: string, key: string) {
    return await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }
}
