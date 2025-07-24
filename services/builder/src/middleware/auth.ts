import { FastifyRequest, FastifyReply } from "fastify";

// Simplified authentication for testing
// In production, this should validate against the database
const VALID_API_KEYS = new Set(
  ["test-api-key", process.env.BUILDER_API_KEY].filter(Boolean),
);

export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const apiKey = request.headers["x-api-key"] as string;

  if (!apiKey) {
    return reply.status(401).send({
      error: "Missing API key",
      message: "Please provide X-API-Key header",
    });
  }

  // For now, just check against known keys
  if (!VALID_API_KEYS.has(apiKey)) {
    return reply.status(401).send({
      error: "Invalid API key",
      message: "The provided API key is not valid",
    });
  }

  // Add dummy organization context
  (request as any).organization = {
    id: "test-org-1",
    name: "Test Organization",
  };
  (request as any).apiKeyId = "test-key-1";
}

// Middleware to check project ownership
export async function checkProjectAccess(
  request: FastifyRequest<{ Body: { projectId?: string } }>,
  _reply: FastifyReply,
) {
  // For now, just allow access to test projects
  const projectId =
    request.body?.projectId || (request.params as any)?.projectId;

  if (!projectId) {
    return;
  }

  // Allow test projects
  if (!projectId.startsWith("test-project-")) {
    // In production, check against database
    // For now, we'll skip this check
  }
}
