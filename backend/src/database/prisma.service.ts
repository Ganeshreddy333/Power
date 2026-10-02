import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Use runtime require to avoid TypeScript import issues across Prisma versions
const { PrismaClient } = require('@prisma/client');

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  [key: string]: any;

  private client: any;
  private readonly enabled: boolean;

  constructor() {
    const url = process.env.DATABASE_URL;
    this.enabled = Boolean(url && url.trim());

    if (!this.enabled) {
      this.client = this.createMockClient();
      Object.assign(this, this.client);
      return;
    }

    try {
      const databaseUrl = new URL(url!);
      const isLocalDatabase = ['localhost', '127.0.0.1'].includes(databaseUrl.hostname);
      const socketPath = databaseUrl.searchParams.get('socket') || undefined;
      const sslMode = databaseUrl.searchParams.get('ssl-mode')?.toLowerCase();
      const sslCa = process.env.MYSQL_SSL_CA_BASE64
        ? Buffer.from(process.env.MYSQL_SSL_CA_BASE64, 'base64').toString('utf8')
        : process.env.MYSQL_SSL_CA?.replace(/\\n/g, '\n');
      const requiresSsl = sslMode === 'required' || Boolean(sslCa);

      const sslConfig = requiresSsl
        ? (sslCa
          ? { ca: sslCa, rejectUnauthorized: true }
          : { rejectUnauthorized: false })
        : undefined;

      const adapter = new PrismaMariaDb({
        host: databaseUrl.hostname,
        port: Number(databaseUrl.port) || 3306,
        user: decodeURIComponent(databaseUrl.username),
        password: decodeURIComponent(databaseUrl.password),
        database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
        connectionLimit: 5,
        ...(socketPath ? { socketPath } : { allowPublicKeyRetrieval: isLocalDatabase }),
        ...(sslConfig ? { ssl: sslConfig } : {}),
      });
      this.client = new PrismaClient({ adapter });
      Object.assign(this, this.client);
    } catch (error) {
      throw new Error(`Prisma client initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onModuleInit() {
    if (!this.enabled) return;
    if (typeof this['$connect'] === 'function') await this['$connect']();
  }

  async onModuleDestroy() {
    if (!this.enabled) return;
    if (typeof this['$disconnect'] === 'function') await this['$disconnect']();
  }

  private createMockClient() {
    return {
      $connect: async () => undefined,
      $disconnect: async () => undefined,
      $queryRawUnsafe: async () => [],
      $executeRawUnsafe: async () => undefined,
      user: {
        create: async () => null,
        findUnique: async () => null,
        findMany: async () => [],
      },
      data: {},
    };
  }
}
