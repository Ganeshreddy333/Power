import { BadRequestException, Body, Controller, Delete, Get, Logger, NotFoundException, Param, Post, Res, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { basename, dirname, extname } from 'path';
import type { Response } from 'express';
import { CloudinaryService } from './cloudinary.service';
import { AdminDataGuard } from '../data/admin-data.guard';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const IMAGE_BUCKETS = new Set(['speaker-images', 'media-partner-images']);
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', extension: '.jpg', matches: (buffer: Buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { mime: 'image/png', extension: '.png', matches: (buffer: Buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', extension: '.webp', matches: (buffer: Buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
];

@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post(':bucket/upload')
  @UseGuards(AdminDataGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @Param('bucket') bucket: string,
    @Body('path') path: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!Buffer.isBuffer(file.buffer)) throw new BadRequestException('Uploaded file content is unavailable.');
    if (file.buffer.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Files must be no larger than 5 MB.');
    if (bucket !== 'abstract-assets' && !IMAGE_BUCKETS.has(bucket)) throw new BadRequestException('Unsupported storage bucket');

    if (IMAGE_BUCKETS.has(bucket)) {
      const detected = Buffer.isBuffer(file.buffer)
        ? IMAGE_SIGNATURES.find((signature) => signature.matches(file.buffer))
        : undefined;
      if (!detected || file.mimetype !== detected.mime) {
        throw new BadRequestException('Upload a valid JPEG, PNG, or WebP image.');
      }
      try {
        const stored = await this.cloudinaryService.uploadFile(
          file.buffer,
          `${randomUUID()}${detected.extension}`,
          bucket,
        );
        return {
          url: stored.url.startsWith('/storage/local/')
            ? `/storage/public/${stored.publicId}`
            : stored.url,
          publicId: stored.publicId,
        };
      } catch (error) {
        this.logger.error(JSON.stringify({
          event: 'storage.image_upload.failed',
          bucket,
          code: error && typeof error === 'object' && 'http_code' in error ? String(error.http_code) : 'STORAGE_ERROR',
        }));
        throw new ServiceUnavailableException('Image storage is temporarily unavailable.');
      }
    }

    if (!ALLOWED_UPLOAD_TYPES.has(file.mimetype)) throw new BadRequestException('Unsupported file type');

    try {
      const relativePath = String(path || file.originalname).replace(/^\/+/, '');
      const relativeDirectory = dirname(relativePath);
      const fileName = basename(relativePath);
      const storedPath = `${relativeDirectory === '.' ? '' : `${relativeDirectory}/`}${fileName}`;
      const publicId = await this.cloudinaryService.saveLocalFile(file.buffer, `${bucket}/${storedPath}`);

      return {
        url: `/storage/${bucket}/${storedPath}`,
        publicId,
        path: storedPath,
      };
    } catch (error) {
      this.logger.error(JSON.stringify({
        event: 'storage.file_upload.failed',
        bucket,
        code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'STORAGE_ERROR',
      }));
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  @Get('local/:bucket/*path')
  @UseGuards(AdminDataGuard)
  async downloadLocal(@Param('bucket') bucket: string, @Param() params: any, @Res() response: Response) {
    const publicId = Array.isArray(params.path) ? params.path.join('/') : params.path;
    return this.sendLocalFile(bucket, publicId, response);
  }

  @Get(':bucket/download/*path')
  @UseGuards(AdminDataGuard)
  async downloadStoredFile(@Param('bucket') bucket: string, @Param() params: any, @Res() response: Response) {
    const publicId = Array.isArray(params.path) ? params.path.join('/') : params.path;
    return this.sendLocalFile(bucket, publicId, response);
  }

  @Get('public/:bucket/*path')
  async servePublicImage(@Param('bucket') bucket: string, @Param() params: any, @Res() response: Response) {
    if (!IMAGE_BUCKETS.has(bucket)) throw new NotFoundException('Stored image was not found.');
    const publicId = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
    const type = this.contentType(publicId);
    if (!type.startsWith('image/')) throw new NotFoundException('Stored image was not found.');
    try {
      const file = await this.cloudinaryService.getLocalFile(`${bucket}/${publicId}`);
      response.setHeader('Content-Disposition', `inline; filename="${basename(publicId)}"`);
      response.setHeader('Content-Type', type);
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.send(file);
    } catch {
      throw new NotFoundException('Stored image was not found.');
    }
  }

  @Get(':bucket/*path')
  @UseGuards(AdminDataGuard)
  async download(@Param('bucket') bucket: string, @Param() params: any, @Res() response: Response) {
    const publicId = Array.isArray(params.path) ? params.path.join('/') : params.path;
    if (bucket === 'abstract-assets') {
      return this.sendLocalFile(bucket, publicId, response);
    }
    const url = await this.cloudinaryService.getUrl(`${bucket}/${publicId}`);
    return { url };
  }

  @Delete(':bucket/:publicId')
  @UseGuards(AdminDataGuard)
  async delete(@Param('bucket') bucket: string, @Param('publicId') publicId: string) {
    try {
      await this.cloudinaryService.deleteFile(`${bucket}/${publicId}`);
      return { message: 'File deleted successfully' };
    } catch (error: any) {
      return { error: error?.message ?? String(error) };
    }
  }

  private contentType(filePath: string) {
    const types: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    return types[extname(filePath).toLowerCase()] || 'application/octet-stream';
  }

  private async sendLocalFile(bucket: string, publicId: string, response: Response) {
    try {
      const file = await this.cloudinaryService.getLocalFile(`${bucket}/${publicId}`);
      response.setHeader('Content-Disposition', `attachment; filename="${basename(publicId)}"`);
      response.setHeader('Content-Type', this.contentType(publicId));
      response.setHeader('Cache-Control', 'private, no-store');
      response.send(file);
    } catch {
      throw new NotFoundException('Stored file was not found.');
    }
  }
}
