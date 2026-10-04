import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message || message;
        error = obj.error || exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
    }

    // Replace raw throttler class name with a human-readable message
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      message = 'Too many requests — please wait a moment and try again.';
    }

    const body: Record<string, any> = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
    };

    if (
      process.env.NODE_ENV !== 'production' &&
      exception instanceof Error
    ) {
      body.stack = exception.stack;
    }

    response.status(status).json(body);
  }
}
