import { PrismaClient } from "@prisma/client";
import logger from "./logger";

// Models that require tenant isolation
const TENANT_MODELS = [
  "project",
  "invoice",
  "auditLog",
  "teamInvitation",
  "auditLogRetention",
];

// Models that are scoped by user
const USER_SCOPED_MODELS = ["notification", "oAuthAccount"];

// Models that require indirect tenant validation
const INDIRECT_TENANT_MODELS = {
  deployment: "project",
  environment: "project",
  usageEvent: "project",
};

export interface RLSContext {
  teamId?: string;
  userId?: string;
  role?: string;
  bypassRLS?: boolean; // For system operations
}

// Row-Level Security middleware for Prisma
export function createRLSMiddleware(context: RLSContext) {
  return async (params: any, next: any) => {
    // Skip RLS for system operations
    if (context.bypassRLS) {
      return next(params);
    }

    // Apply RLS for tenant-isolated models
    if (TENANT_MODELS.includes(params.model)) {
      if (!context.teamId) {
        logger.error("RLS violation: No teamId in context", {
          model: params.model,
          action: params.action,
        });
        throw new Error("Access denied: No tenant context");
      }

      // Apply teamId filter to queries
      if (["findMany", "findFirst", "findUnique", "count", "aggregate"].includes(params.action)) {
        params.args.where = {
          ...params.args.where,
          teamId: context.teamId,
        };
      }

      // Apply teamId to creates
      if (params.action === "create" || params.action === "createMany") {
        if (params.action === "create") {
          params.args.data = {
            ...params.args.data,
            teamId: context.teamId,
          };
        } else {
          params.args.data = params.args.data.map((item: any) => ({
            ...item,
            teamId: context.teamId,
          }));
        }
      }

      // Apply teamId filter to updates and deletes
      if (["update", "updateMany", "delete", "deleteMany"].includes(params.action)) {
        params.args.where = {
          ...params.args.where,
          teamId: context.teamId,
        };
      }
    }

    // Apply RLS for user-scoped models
    if (USER_SCOPED_MODELS.includes(params.model)) {
      if (!context.userId) {
        logger.error("RLS violation: No userId in context", {
          model: params.model,
          action: params.action,
        });
        throw new Error("Access denied: No user context");
      }

      // Apply userId filter to queries
      if (["findMany", "findFirst", "findUnique", "count"].includes(params.action)) {
        params.args.where = {
          ...params.args.where,
          userId: context.userId,
        };
      }

      // Apply userId to creates
      if (params.action === "create") {
        params.args.data = {
          ...params.args.data,
          userId: context.userId,
        };
      }

      // Apply userId filter to updates and deletes
      if (["update", "delete"].includes(params.action)) {
        params.args.where = {
          ...params.args.where,
          userId: context.userId,
        };
      }
    }

    // Apply RLS for models with indirect tenant relationship
    if (INDIRECT_TENANT_MODELS[params.model]) {
      if (!context.teamId) {
        logger.error("RLS violation: No teamId in context for indirect model", {
          model: params.model,
          action: params.action,
        });
        throw new Error("Access denied: No tenant context");
      }

      const relationField = INDIRECT_TENANT_MODELS[params.model];

      // Apply team filter through relation
      if (["findMany", "findFirst", "count", "aggregate"].includes(params.action)) {
        params.args.where = {
          ...params.args.where,
          [relationField]: {
            teamId: context.teamId,
          },
        };
      }

      // For updates and deletes, ensure the resource belongs to the team
      if (["update", "updateMany", "delete", "deleteMany"].includes(params.action)) {
        params.args.where = {
          ...params.args.where,
          [relationField]: {
            teamId: context.teamId,
          },
        };
      }
    }

    // Execute the query
    const result = await next(params);

    // Post-query validation for findUnique (since it doesn't support nested where)
    if (params.action === "findUnique" && result) {
      if (TENANT_MODELS.includes(params.model)) {
        if (result.teamId !== context.teamId) {
          logger.warn("RLS post-query violation", {
            model: params.model,
            expectedTeamId: context.teamId,
            actualTeamId: result.teamId,
          });
          return null;
        }
      }

      if (USER_SCOPED_MODELS.includes(params.model)) {
        if (result.userId !== context.userId) {
          logger.warn("RLS post-query violation", {
            model: params.model,
            expectedUserId: context.userId,
            actualUserId: result.userId,
          });
          return null;
        }
      }
    }

    return result;
  };
}

// Create a tenant-scoped Prisma client
export function createTenantPrismaClient(
  prisma: PrismaClient,
  context: RLSContext
) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          const middleware = createRLSMiddleware(context);
          return middleware(
            { model, action: operation, args },
            async (params: any) => query(params.args)
          );
        },
      },
    },
  });
}

// Utility to create system Prisma client (bypasses RLS)
export function createSystemPrismaClient(prisma: PrismaClient) {
  return createTenantPrismaClient(prisma, { bypassRLS: true });
}

// Validate that a query result belongs to the expected tenant
export function validateTenantOwnership(
  result: any,
  expectedTeamId: string,
  modelName: string
): boolean {
  if (!result) return true; // Null results are valid

  // Direct team relationship
  if (result.teamId) {
    return result.teamId === expectedTeamId;
  }

  // Indirect team relationship through project
  if (result.project?.teamId) {
    return result.project.teamId === expectedTeamId;
  }

  // Check nested relations
  if (INDIRECT_TENANT_MODELS[modelName]) {
    const relationField = INDIRECT_TENANT_MODELS[modelName];
    if (result[relationField]?.teamId) {
      return result[relationField].teamId === expectedTeamId;
    }
  }

  logger.warn("Unable to validate tenant ownership", {
    model: modelName,
    expectedTeamId,
  });

  return false;
}

// Batch validate tenant ownership
export function batchValidateTenantOwnership(
  results: any[],
  expectedTeamId: string,
  modelName: string
): any[] {
  return results.filter(result => 
    validateTenantOwnership(result, expectedTeamId, modelName)
  );
}