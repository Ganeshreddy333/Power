// Entry point for NestJS application
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody` preserves the exact bytes providers signed. Do not add a second
  // JSON parser here: it would discard that buffer before webhook verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", 'https:', 'http:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );

  const frontendUrls = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(url => url.trim());
  app.enableCors({
    origin: frontendUrls,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-signature', 'stripe-signature'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Hosting providers such as Render supply PORT; local development can use API_PORT.
  const port = Number(process.env.PORT || process.env.API_PORT || 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API running on port ${port}`);
  console.log(`📡 CORS enabled for: ${frontendUrls.join(', ')}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch(err => {
  console.error('❌ Application failed to start:', err);
  process.exit(1);
});
