import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname, isAbsolute, normalize, relative, resolve, sep } from 'path';

@Injectable()
export class CloudinaryService {
  private readonly configured: boolean;
  private readonly localStorageRoot = resolve(process.cwd(), 'storage');

  constructor(private configService: ConfigService) {
    this.configured = Boolean(
      this.configService.get('CLOUDINARY_CLOUD_NAME') &&
      this.configService.get('CLOUDINARY_API_KEY') &&
      this.configService.get('CLOUDINARY_API_SECRET'),
    );
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    folder: string = 'conference',
  ): Promise<{ url: string; publicId: string }> {
    if (!this.configured) {
      const publicId = `${folder}/${fileName}`.replace(/^\/+/, '');
      const target = this.localPath(publicId);
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.writeFile(target, fileBuffer);
      return { url: `/storage/local/${publicId}`, publicId };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: fileName.replace(/\.[^/.]+$/, ''),
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary upload returned no result'));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.end(fileBuffer);
    });
  }

  async saveLocalFile(fileBuffer: Buffer, relativePath: string): Promise<string> {
    const publicId = this.localPublicId(relativePath);
    const target = this.localPath(publicId);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, fileBuffer);
    return publicId;
  }

  async deleteLocalFile(relativePath: string): Promise<void> {
    await fs.rm(this.localPath(this.localPublicId(relativePath)), { force: true });
  }

  async deleteFile(publicId: string): Promise<void> {
    if (!this.configured) {
      await fs.rm(this.localPath(publicId), { force: true });
      return;
    }
    await cloudinary.uploader.destroy(publicId.replace(/\.[^/.]+$/, ''));
  }

  async getUrl(publicId: string): Promise<string> {
    if (!this.configured) return `/storage/local/${publicId}`;
    return cloudinary.url(publicId, { secure: true });
  }

  async getLocalFile(publicId: string) {
    return fs.readFile(this.localPath(publicId));
  }

  private localPath(publicId: string) {
    const safePath = normalize(publicId);
    const target = resolve(this.localStorageRoot, safePath);
    const pathFromRoot = relative(this.localStorageRoot, target);
    if (!pathFromRoot || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
      throw new Error('Invalid storage path');
    }
    return target;
  }

  private localPublicId(relativePath: string) {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.split('/').some((segment) => segment === '..' || segment === '.')) {
      throw new Error('Invalid storage path');
    }
    return normalized;
  }
}
