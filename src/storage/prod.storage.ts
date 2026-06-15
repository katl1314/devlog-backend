import { StorageInterface } from './storage.interface';

export class ProdStorage implements StorageInterface {
  constructor() {}

  upload(
    bucket: string,
    key: string,
    body: string | Buffer,
    contentType?: string,
  ): Promise<void> {
    console.info('upload', bucket, key, body, contentType);
    throw new Error('Method not implemented.');
  }
  get(bucket: string, key: string): Promise<string> {
    console.info('get', bucket, key);
    throw new Error('Method not implemented.');
  }
  getBuffer(
    bucket: string,
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    console.info('getBuffer', bucket, key);
    throw new Error('Method not implemented.');
  }
  delete(bucket: string, key: string): Promise<void> {
    console.info('delete', bucket, key);
    throw new Error('Method not implemented.');
  }
}
