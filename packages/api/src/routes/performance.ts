import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { jwtMiddleware, jwtService } from "./auth";
import { performanceMonitor } from "../lib/performance";
import { getOptimizationService } from "../services/performance/optimization.service";
import logger from "../lib/logger";

const router = Router();
const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    teamId: string;
    role: string;
  };
}

// GET /api/performance/stats - Get current performance statistics
router.get(
  "/performance/stats",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view performance stats
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const stats = performanceMonitor.getStats();
      const optimizationService = getOptimizationService(prisma);
      const recommendations = await optimizationService.getOptimizationRecommendations();
      
      res.json({
        system: {
          uptime: stats.uptime,
          memory: {
            rss: `${(stats.memory.rss / 1024 / 1024).toFixed(2)}MB`,
            heapTotal: `${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
            heapUsed: `${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
            external: `${(stats.memory.external / 1024 / 1024).toFixed(2)}MB`,
          },
          eventLoop: stats.eventLoopUtilization,
        },
        recommendations,
      });
    } catch (error) {
      logger.error("Failed to get performance stats", { error });
      res.status(500).json({ error: "Failed to retrieve performance statistics" });
    }
  }
);

// GET /api/performance/metrics - Get Prometheus metrics
router.get(
  "/performance/metrics",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view metrics
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      // Get Prometheus metrics from the main metrics endpoint
      const metricsResponse = await fetch(`http://localhost:${process.env.PORT || 4000}/metrics`);
      const metricsText = await metricsResponse.text();
      
      res.set("Content-Type", "text/plain");
      res.send(metricsText);
    } catch (error) {
      logger.error("Failed to get metrics", { error });
      res.status(500).json({ error: "Failed to retrieve metrics" });
    }
  }
);

// POST /api/performance/analyze - Analyze performance for a specific operation
router.post(
  "/performance/analyze",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can analyze performance
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const { operation, duration } = req.body;
      
      if (!operation || !duration) {
        return res.status(400).json({ error: "Operation and duration required" });
      }
      
      // Analyze the operation
      const analysis = {
        operation,
        duration,
        performance: duration < 100 ? "excellent" : duration < 500 ? "good" : duration < 1000 ? "fair" : "poor",
        suggestions: [],
      };
      
      if (duration > 1000) {
        analysis.suggestions.push("Consider implementing caching for this operation");
        analysis.suggestions.push("Review database queries for optimization opportunities");
      }
      
      if (duration > 500) {
        analysis.suggestions.push("Consider using pagination or limiting result sets");
      }
      
      res.json(analysis);
    } catch (error) {
      logger.error("Failed to analyze performance", { error });
      res.status(500).json({ error: "Failed to analyze performance" });
    }
  }
);

// GET /api/performance/slow-queries - Get slow query log
router.get(
  "/performance/slow-queries",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can view slow queries
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      // In a real implementation, this would query a slow query log
      // For now, return mock data
      const slowQueries = [
        {
          query: "SELECT * FROM projects WHERE teamId = ?",
          duration: 1250,
          timestamp: new Date(Date.now() - 3600000),
          suggestion: "Add index on teamId column",
        },
        {
          query: "SELECT COUNT(*) FROM usage_events",
          duration: 2100,
          timestamp: new Date(Date.now() - 7200000),
          suggestion: "Consider using materialized views for aggregations",
        },
      ];
      
      res.json({ slowQueries });
    } catch (error) {
      logger.error("Failed to get slow queries", { error });
      res.status(500).json({ error: "Failed to retrieve slow queries" });
    }
  }
);

// POST /api/performance/optimize - Run optimization tasks
router.post(
  "/performance/optimize",
  jwtMiddleware(jwtService),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    try {
      // Only admins can run optimizations
      if (authReq.user?.role !== "admin" && authReq.user?.role !== "owner") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      
      const { task } = req.body;
      
      const optimizationService = getOptimizationService(prisma);
      let result;
      
      switch (task) {
        case "analyze":
          result = await optimizationService.getOptimizationRecommendations();
          break;
        case "vacuum":
          // In a real implementation, this would run VACUUM on PostgreSQL
          result = { message: "Database vacuum scheduled" };
          break;
        case "reindex":
          // In a real implementation, this would reindex tables
          result = { message: "Database reindex scheduled" };
          break;
        default:
          return res.status(400).json({ error: "Invalid optimization task" });
      }
      
      res.json({ task, result });
    } catch (error) {
      logger.error("Failed to run optimization", { error });
      res.status(500).json({ error: "Failed to run optimization task" });
    }
  }
);

export { router as performanceRouter };