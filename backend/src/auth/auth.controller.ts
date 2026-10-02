import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    short: { limit: 5, ttl: 60_000 },
    long: { limit: 30, ttl: 60 * 60 * 1000 },
  })
  register(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string,
  ) {
    return this.authService.register(email, password, firstName, lastName);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 50, ttl: 60 * 60 * 1000 },
  })
  login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.login(email, password);
  }
}
