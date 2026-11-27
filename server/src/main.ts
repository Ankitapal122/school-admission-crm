import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

// Prevent async socket/Baileys/network errors from crashing the Render process (502 Bad Gateway)
process.on('unhandledRejection', (reason: any) => {
  console.error('[Process] Unhandled Rejection caught safely:', reason?.message || reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('[Process] Uncaught Exception caught safely:', err?.message || err);
});

async function bootstrap() {
  console.log(`[Boot] Initializing BoardingEdu CRM (Node ${process.version}, PORT=${process.env.PORT || 5000})...`);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);

  // Security headers & response compression (avoid HSTS on plain HTTP localhost)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: process.env.NODE_ENV === 'production',
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  // Rewrite /v1/* and /api/v1/* cleanly to /api/* while keeping Swagger docs & static assets intact
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-API-Version', '3.0');
    if (req.url === '/v1' || req.url.startsWith('/v1/')) {
      req.url = '/api' + req.url.slice(3);
    } else if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) {
      req.url = '/api' + req.url.slice(7);
    }
    next();
  });

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  // Swagger OpenAPI documentation at /api/docs (non-fatal)
  try {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BoardingEdu Enterprise CRM API')
      .setDescription('Unified Student CRM & Boarding School Admissions REST API (/api and /v1)')
      .setVersion('3.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  } catch (swaggerErr: any) {
    console.warn('[Boot] Swagger setup skipped:', swaggerErr?.message || swaggerErr);
  }

  // Serve school_images from Documents/school_images at /school-images
  const docsImagesA = path.resolve(process.cwd(), '..', 'Documents', 'school_images');
  const docsImagesB = path.resolve(process.cwd(), 'Documents', 'school_images');
  const resolvedSchoolImages = fs.existsSync(docsImagesA)
    ? docsImagesA
    : fs.existsSync(docsImagesB)
      ? docsImagesB
      : null;
  if (resolvedSchoolImages) {
    app.useStaticAssets(resolvedSchoolImages, { prefix: '/school-images/' });
  }

  // Serve built client static files if available (production / single-port deploy)
  const clientDist = path.resolve(process.cwd(), '..', 'client', 'dist');
  const clientDistAlt = path.resolve(process.cwd(), 'client', 'dist');
  const resolvedDist = fs.existsSync(clientDist)
    ? clientDist
    : fs.existsSync(clientDistAlt)
      ? clientDistAlt
      : null;

  if (resolvedDist) {
    app.useStaticAssets(resolvedDist, {
      setHeaders: (res: Response, filePath: string) => {
        if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('registerSW.js')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        !req.url.startsWith('/api') &&
        !req.url.startsWith('/socket.io') &&
        !req.url.startsWith('/notifications') &&
        !req.url.includes('.')
      ) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.sendFile(path.join(resolvedDist, 'index.html'));
      }
      next();
    });
  }

  const port = Number(process.env.PORT || 5000);
  const listenHost =
    process.env.RENDER || process.env.NODE_ENV === 'production' ? '0.0.0.0' : undefined;
  if (listenHost) {
    await app.listen(port, listenHost);
  } else {
    await app.listen(port);
  }

  // Render.com / reverse-proxy official fix: prevent intermittent 502 Bad Gateway
  // caused by Node's 5s default keepAliveTimeout racing against proxy keep-alive (60s+)
  const httpServer = app.getHttpServer();
  if (httpServer) {
    httpServer.keepAliveTimeout = 120_000;
    httpServer.headersTimeout = 125_000;
  }

  console.log(`🚀 BoardingEdu Enterprise CRM Backend listening on ${listenHost || 'localhost'}:${port}/api (Docs: /api/docs, v1: /v1)`);
}
bootstrap().catch((err) => {
  console.error('[FATAL BOOTSTRAP ERROR]', err);
  process.exit(1);
});
