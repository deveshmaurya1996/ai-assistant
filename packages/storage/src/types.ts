export type StorageBackend = 'r2' | 'local';

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface FileStorage {
  readonly backend: StorageBackend;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  listObjectKeys(prefix: string): Promise<string[]>;
}

export interface StorageConfig {
  backend: StorageBackend;
  localRoot: string;
  r2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    endpoint: string;
  };
}
