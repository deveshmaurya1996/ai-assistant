import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { FileStorage, PutObjectInput } from '../types';

export type R2StorageOptions = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

export class R2Storage implements FileStorage {
  readonly backend = 'r2' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: R2StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putObject({ key, body, contentType }: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    if (!res.Body) {
      throw new Error(`R2 object empty: ${key}`);
    }
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}
