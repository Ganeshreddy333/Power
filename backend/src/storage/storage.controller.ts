import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

@Controller('storage')
export class StorageController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post(':bucket/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @Param('bucket') bucket: string,
    @Body('path') path: string,
    @UploadedFile() file: any,
  ) {
    if (!file) return { error: 'No file uploaded' };
    if (bucket !== 'abstract-assets') throw new BadRequestException('Unsupported storage bucket');
    if (!ALLOWED_UPLOAD_TYPES.has(file.mimetype)) throw new BadRequestException('Unsupported file type');

    try {
      const relativePath = String(path || file.originalname).replace(/^\/+/, '');
      const relativeDirectory = dirname(relativePath);
      const folderPath = relativeDirectory === '.' ? bucket : `${bucket}/${relativeDirectory}`;
      const fileName = basename(relativePath);
      const storedPath = `${relativeDirectory === '.' ? '' : `${relativeDirectory}/`}${fileName}`;
      const publicId = await this.cloudinaryService.saveLocalFile(file.buffer, `${bucket}/${storedPath}`);

      return {
        url: `/storage/${bucket}/${storedPath}`,
        publicId,
        path: storedPath,
      };
    } catch (error: any) {
      return { error: error?.message ?? String(error) };
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
