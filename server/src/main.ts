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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Security headers & response compression
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use(cookieParser());

  // Rewrite /v1/* and /api/v1/* cleanly to /api/* while keeping Swagger docs & static assets intact
  app.use((req: Request, _res: Response, next: NextFunction) => {
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
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  // Swagger OpenAPI documentation at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BoardingEdu Enterprise CRM API')
    .setDescription('Unified Student CRM & Boarding School Admissions REST API (/api and /v1)')
    .setVersion('3.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

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

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`🚀 BoardingEdu Enterprise CRM Backend listening on http://localhost:${port}/api (Docs: /api/docs, v1: /v1)`);
}
bootstrap();
