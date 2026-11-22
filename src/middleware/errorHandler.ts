import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { formatBytes } from '../utils/formatters';
import { MAX_FILE_SIZE } from '../config';
import type { AppError } from '../types';

const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        error: `File is too large. Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)}.`,
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
    return;
  }

  if (err) {
    console.error('Unhandled server error:', err);
    const appErr = err as AppError;
    res.status(appErr.status ?? 500).json({
      success: false,
      error: appErr.message || 'Internal server error',
    });
    return;
  }

  next();
};

export default errorHandler;
