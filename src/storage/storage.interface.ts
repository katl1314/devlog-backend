export const STORAGE_SERVICE = 'STORAGE_SERVICE'; // provide @Inject(provide)

export interface StorageInterface {
  upload(
    bucket: string,
    key: string,
    body: string | Buffer,
    contentType?: string,
  ): Promise<any>;
  get(bucket: string, key: string): Promise<string | undefined | null>;
  delete(bucket: string, key: string): Promise<any>;
}

export const STORAGE_BUCKET_POST =
  process.env.SEAWEEDFS_BUCKET_POSTS || 'posts';
export const STORAGE_BUCKET_IMAGES =
  process.env.SEAWEEDFS_BUCKET_IMAGES || 'images';
export const STORAGE_BUCKET_AVATARS =
  process.env.SEAWEEDFS_BUCKET_AVATARS || 'avatars';
