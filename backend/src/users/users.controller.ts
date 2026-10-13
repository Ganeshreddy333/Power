import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminDataGuard } from '../data/admin-data.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AdminDataGuard)
  findAll() {
    return this.usersService.findAll();
  }
}
