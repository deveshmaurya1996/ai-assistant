import fs from 'node:fs';
import path from 'node:path';
import type { FileStorage, PutObjectInput } from '../types';

export class LocalDiskStorage implements FileStorage {
  readonly backend = 'local' as const;

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const resolved = path.resolve(this.root, key);
    const rootResolved = path.resolve(this.root);
    if (!resolved.startsWith(rootResolved)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async putObject({ key, body }: PutObjectInput): Promise<void> {
    const abs = this.resolve(key);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolve(key));
  }

  async deleteObject(key: string): Promise<void> {
    await fs.promises.unlink(this.resolve(key)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }

  createReadStream(key: string): fs.ReadStream {
    return fs.createReadStream(this.resolve(key));
  }
}
