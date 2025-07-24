import { Router } from "express";
import { authRouter } from "../auth";
import { billingRouter } from "../billing";
import { usageRouter } from "../usage";
import { subscriptionsRouter } from "../subscriptions";
import { logsRouter } from "../logs";
import { alertsRouter } from "../alerts";
import { rateLimitRouter } from "../rate-limit";
import { auditRouter } from "../audit";
import { oauthRouter } from "../oauth";
import { teamRouter } from "../team";
import { permissionsRouter } from "../permissions";
import { complianceRouter } from "../compliance";
import { performanceRouter } from "../performance";
import { onboardingRouter } from "../onboarding";
import { webhooksRouter } from "../webhooks";
import { usersRouter } from "./users";
import { projectsRouter } from "./projects";
import { deploymentsRouter } from "./deployments";

const v2Router = Router();

// Mount all v2 routes (includes v1 routes plus new ones)
v2Router.use("/auth", authRouter);
v2Router.use("/billing", billingRouter);
v2Router.use("/usage", usageRouter);
v2Router.use("/subscriptions", subscriptionsRouter);
v2Router.use("/logs", logsRouter);
v2Router.use("/alerts", alertsRouter);
v2Router.use("/rate-limits", rateLimitRouter);
v2Router.use("/audit", auditRouter);
v2Router.use("/oauth", oauthRouter);
v2Router.use("/teams", teamRouter);
v2Router.use("/permissions", permissionsRouter);
v2Router.use("/compliance", complianceRouter);
v2Router.use("/performance", performanceRouter);
v2Router.use("/onboarding", onboardingRouter);

// New v2 endpoints
v2Router.use("/users", usersRouter);
v2Router.use("/projects", projectsRouter);
v2Router.use("/deployments", deploymentsRouter);
v2Router.use("/webhooks", webhooksRouter);

export { v2Router };