import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../database/prisma.module';
import { AdminDataGuard } from '../data/admin-data.guard';

@Module({
  imports: [PrismaModule, JwtModule],
  providers: [UsersService, AdminDataGuard],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
