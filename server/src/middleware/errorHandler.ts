/**
 * 统一错误处理中间件
 *
 * 标准错误响应格式：{ error: string, code: string, details?: any }
 * 使用工厂函数创建常见错误：notFound(), badRequest(), internalError()
 */

import type { Request, Response, NextFunction } from 'express';

// ======================== 标准错误类 ========================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ======================== 错误工厂函数 ========================

export function notFound(message: string = '资源未找到'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function badRequest(message: string = '请求参数无效', details?: unknown): AppError {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

export function internalError(message: string = '服务器内部错误', details?: unknown): AppError {
  return new AppError(500, 'INTERNAL_ERROR', message, details);
}

// ======================== Express 错误处理中间件 ========================

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // 未预期的错误
  console.error('[Express Error]', err.message);
  if (!res.headersSent) {
    res.status(500).json({
      error: '服务器内部错误',
      code: 'INTERNAL_ERROR',
    });
  }
}
