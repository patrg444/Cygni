import { Request, Response, NextFunction } from 'express';

/**
 * Async handler wrapper for Express routes
 * Catches async errors and passes them to Express error handler
 */
type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const asyncHandler = (fn: AsyncFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};