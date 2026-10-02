import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StorageController } from './storage.controller';
import { CloudinaryService } from './cloudinary.service';
import { DataModule } from '../data/data.module';

@Module({
  // AdminDataGuard is used by StorageController and needs JwtService in this
  // module's dependency-injection context.
  imports: [forwardRef(() => DataModule), JwtModule],
  providers: [CloudinaryService],
  controllers: [StorageController],
  exports: [CloudinaryService],
})
export class StorageModule {}
