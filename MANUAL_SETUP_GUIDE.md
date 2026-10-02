# Manual Project Setup Guide - Modern Stack
**Frontend**: React + Next.js + TypeScript + Tailwind CSS  
**Backend**: Node.js + NestJS + TypeScript  
**Database**: MySQL  
**ORM**: Prisma  
**Auth**: JWT + Passport.js

---

## Project Structure (Monorepo)
```
project-root/
├── backend/                 # NestJS application
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── auth/            # Authentication modules
│   │   ├── users/           # User management
│   │   └── config/          # Configuration
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── .env
│   └── package.json
├── frontend/                # Next.js application
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── .env.local
│   └── package.json
├── .gitignore
└── README.md
```

---

## STEP 1: Backend Setup

### 1.1 Create Backend Directory Structure
```bash
# Navigate to project root
cd /Users/apple/Downloads/25-05-2026

# Create backend folder
mkdir backend
cd backend
```

### 1.2 Initialize Node.js Project
```bash
npm init -y
```

This creates `package.json`. Edit it:
```json
{
  "name": "conference-backend",
  "version": "1.0.0",
  "description": "Conference API Backend",
  "main": "dist/main.js",
  "scripts": {
    "start": "node dist/main.js",
    "dev": "ts-node -r tsconfig-paths/register src/main.ts",
    "build": "nest build",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

### 1.3 Install NestJS Core Dependencies
```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs
npm install class-validator class-transformer
npm install @nestjs/config
npm install prisma @prisma/client
npm install @nestjs/passport passport passport-jwt jwt-decode
npm install bcryptjs
npm install --save-dev @types/node @types/express @types/bcryptjs @types/passport-jwt
npm install --save-dev typescript ts-loader ts-node @types/jest jest @nestjs/testing
npm install --save-dev @nestjs/cli tsconfig-paths
npm install mysql2
```

### 1.4 Setup TypeScript Configuration
Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "lib": ["ES2021"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

### 1.5 Initialize Prisma
```bash
npx prisma init
```

This creates:
- `prisma/schema.prisma` - Database schema
- `.env` - Environment variables

---

## STEP 2: Database Setup

### 2.1 Install MySQL Locally
**Mac Option 1: Using Homebrew**
```bash
brew install mysql
brew services start mysql

# Verify installation
mysql --version

# Connect to MySQL
mysql -u root
```

**Mac Option 2: Using Docker**
```bash
# Install Docker Desktop if not already installed
# Then run:
docker run --name mysql -e MYSQL_ROOT_PASSWORD=rootpassword -p 3306:3306 -d mysql:8.0
```

### 2.2 Create Database
```bash
# Connect to MySQL
mysql -u root -p

# Inside MySQL prompt:
CREATE DATABASE conference_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'conf_user'@'localhost' IDENTIFIED BY 'secure_password_123';
GRANT ALL PRIVILEGES ON conference_db.* TO 'conf_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2.3 Update `.env` in Backend
```env
# Database
DATABASE_URL="mysql://conf_user:secure_password_123@localhost:3306/conference_db"

# JWT
JWT_SECRET="your_super_secret_jwt_key_change_this_in_production"
JWT_EXPIRATION="24h"

# API
API_PORT=3001
```

---

## STEP 3: Database Schema with Prisma

### 3.1 Edit `prisma/schema.prisma`
```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// User model - for authentication
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // bcrypted
  firstName String
  lastName  String
  role      String   @default("user") // "admin", "user", "speaker"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  registrations AbstractSubmission[]
  registrations Registration[]

  @@map("users")
}

// Admin settings
model AdminSettings {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String   @db.LongText
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("admin_settings")
}

// Conference details
model ConferenceInfo {
  id    String @id @default(cuid())
  title String
  description String @db.Text
  startDate DateTime
  endDate   DateTime
  location  String
  image     String?

  @@map("conference_info")
}

// Speakers
model Speaker {
  id          String   @id @default(cuid())
  name        String
  title       String?
  bio         String?  @db.Text
  image       String?
  email       String
  createdAt   DateTime @default(now())

  sessions Session[]

  @@map("speakers")
}

// Sessions/Tracks
model Session {
  id          String   @id @default(cuid())
  title       String
  description String   @db.Text
  startTime   DateTime
  endTime     DateTime
  room        String
  createdAt   DateTime @default(now())

  speakers Speaker[]

  @@map("sessions")
}

// Abstract submissions
model AbstractSubmission {
  id          String   @id @default(cuid())
  title       String
  description String   @db.Text
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  status      String   @default("pending") // "pending", "approved", "rejected"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("abstract_submissions")
}

// User registrations
model Registration {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  registrationType String @default("standard") // "standard", "premium", "student"
  paymentStatus String @default("pending") // "pending", "completed", "failed"
  couponCode  String?
  amount      Decimal
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("registrations")
}

// Coupon codes
model Coupon {
  id        String   @id @default(cuid())
  code      String   @unique
  discount  Decimal  // percentage (5.00 = 5%)
  isActive  Boolean  @default(true)
  maxUses   Int?
  usedCount Int      @default(0)
  expiresAt DateTime?
  createdAt DateTime @default(now())

  @@map("coupons")
}
```

### 3.2 Create Migration
```bash
cd backend

# Generate migration
npx prisma migrate dev --name init

# This will:
# 1. Create migration files
# 2. Run migration on database
# 3. Generate Prisma Client
```

---

## STEP 4: Backend Project Structure

### 4.1 Create Directory Structure
```bash
cd backend/src

# Core directories
mkdir config
mkdir auth
mkdir users
mkdir common
mkdir database

# Create main files structure:
touch main.ts
touch app.module.ts
```

### 4.2 Create `src/main.ts`
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
}

bootstrap();
```

### 4.3 Create `src/app.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
```

---

## STEP 5: Database Module (Prisma Service)

### 5.1 Create `src/database/prisma.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 5.2 Create `src/database/prisma.service.ts`
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

---

## STEP 6: Authentication with JWT + Passport

### 6.1 Create `src/auth/auth.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION'),
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

### 6.2 Create `src/auth/auth.service.ts`
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  async register(email: string, password: string, firstName: string, lastName: string) {
    // Check if user exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new UnauthorizedException('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
    });

    // Return token
    return this.generateToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateToken(user);
  }

  async validateUser(id: string) {
    return this.usersService.findById(id);
  }

  private generateToken(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }
}
```

### 6.3 Create `src/auth/auth.controller.ts`
```typescript
import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
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
  login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.login(email, password);
  }
}
```

### 6.4 Create `src/auth/strategies/jwt.strategy.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return this.authService.validateUser(payload.sub);
  }
}
```

---

## STEP 7: Users Module

### 7.1 Create `src/users/users.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
```

### 7.2 Create `src/users/users.service.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { email: string; password: string; firstName: string; lastName: string }) {
    return this.prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }
}
```

### 7.3 Create `src/users/users.controller.ts`
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.usersService.findAll();
  }
}
```

---

## STEP 8: Frontend Setup

### 8.1 Navigate to Frontend Directory
```bash
cd /Users/apple/Downloads/25-05-2026
mkdir frontend
cd frontend
```

### 8.2 Create Next.js Project Manually
```bash
npm init -y
```

### 8.3 Install Frontend Dependencies
```bash
# Core Next.js
npm install next react react-dom typescript
npm install @types/react @types/react-dom @types/node

# Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npm install -D @tailwindcss/forms @tailwindcss/typography

# State Management & HTTP
npm install zustand axios
npm install js-cookie
npm install @types/js-cookie

# UI Components
npm install clsx tailwind-merge

# Form handling
npm install react-hook-form zod @hookform/resolvers

# Authentication
npm install jose

# Development
npm install -D eslint eslint-config-next
```

### 8.4 Create `frontend/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "strict": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### 8.5 Create `frontend/next.config.js`
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
```

### 8.6 Create `frontend/tailwind.config.ts`
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#8B5CF6',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
export default config
```

### 8.7 Create `frontend/postcss.config.js`
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### 8.8 Update `frontend/package.json` Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### 8.9 Create Frontend Directory Structure
```bash
cd frontend

# Create directories
mkdir -p src/{components,lib,pages,hooks,store,types,utils,styles}

# Create files
touch src/types/index.ts
touch src/lib/api-client.ts
touch src/store/auth.ts
touch src/hooks/useAuth.ts
```

---

## STEP 9: Frontend Authentication Store

### 9.1 Create `src/store/auth.ts`
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  setAuth: (user: User, token: string) => void;
}

export const useAuthStore = create<AuthStore>(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      login: async (email, password) => {
        const response = await fetch('http://localhost:3001/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) throw new Error('Login failed');

        const data = await response.json();
        set({ user: data.user, token: data.accessToken, isAuthenticated: true });
      },

      register: async (email, password, firstName, lastName) => {
        const response = await fetch('http://localhost:3001/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, firstName, lastName }),
        });

        if (!response.ok) throw new Error('Registration failed');

        const data = await response.json();
        set({ user: data.user, token: data.accessToken, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
);
```

### 9.2 Create `src/lib/api-client.ts`
```typescript
import axios from 'axios';
import { useAuthStore } from '@/store/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
apiClient.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
```

---

## STEP 10: Environment Variables

### Backend `.env`
```env
# Database
DATABASE_URL="mysql://conf_user:secure_password_123@localhost:3306/conference_db"

# JWT
JWT_SECRET="your_super_secret_jwt_key_12345_change_this"
JWT_EXPIRATION="24h"

# API
API_PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"
```

### Frontend `.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Conference
```

---

## STEP 11: Running the Project

### Terminal 1 - Backend
```bash
cd backend
npm run dev
# Output: 🚀 API running on http://localhost:3001
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
# Output: ▲ Next.js 14.0.0
# Ready in 2.5s
# Local: http://localhost:3000
```

---

## Key Learning Points

### **Database Flow**
```
User Input → Next.js Form
  ↓
API Call (axios)
  ↓
NestJS Controller (auth.controller.ts)
  ↓
AuthService (business logic)
  ↓
Prisma Client (ORM)
  ↓
MySQL Database
```

### **Authentication Flow**
```
1. User registers/logs in
2. Password is hashed (bcryptjs)
3. User record created in database
4. JWT token generated
5. Token stored in frontend (zustand store)
6. Token sent in Authorization header for protected routes
7. JwtStrategy validates token
```

### **JWT Token Structure**
```
Header.Payload.Signature

Payload contains:
- sub (subject): user id
- email: user email
- role: user role
- iat: issued at
- exp: expiration time
```

---

## Next Steps
1. Run backend: `npm run dev` (backend folder)
2. Run frontend: `npm run dev` (frontend folder)
3. Test endpoints using Postman or Thunder Client
4. Create API endpoints for conference features
5. Build frontend pages and components

---

## Troubleshooting

**MySQL connection refused?**
- Make sure MySQL is running: `mysql.server status` or `brew services list`
- Check DATABASE_URL in `.env`

**CORS errors?**
- Backend CORS is enabled in main.ts
- Check FRONTEND_URL matches your frontend URL

**JWT errors?**
- Make sure JWT_SECRET is set
- Token format: `Authorization: Bearer <token>`

**Module not found?**
- Run `npm install` in both backend and frontend
- Clear node_modules: `rm -rf node_modules && npm install`
