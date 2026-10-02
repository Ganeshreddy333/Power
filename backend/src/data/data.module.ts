import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../database/prisma.module';
import { EmailModule } from '../email/email.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { AdminDataGuard } from './admin-data.guard';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, EmailModule, JwtModule, forwardRef(() => StorageModule)],
  controllers: [DataController],
  providers: [DataService, AdminDataGuard],
  exports: [AdminDataGuard, DataService],
})
export class DataModule {}
