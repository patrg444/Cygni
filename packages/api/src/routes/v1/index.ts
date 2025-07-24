import { Router } from "express";
import { authRouter } from "../auth";
import { billingRouter } from "../billing";
import { usageRouter } from "../usage";
import { subscriptionsRouter } from "../subscriptions";
import { logsRouter } from "../logs";
import { alertsRouter } from "../alerts";
import { teamRouter } from "../team";
import { deprecatedEndpoint } from "../../middleware/api-version.middleware";

const v1Router = Router();

// Mount all v1 routes
v1Router.use("/auth", authRouter);
v1Router.use("/billing", billingRouter);
v1Router.use("/usage", usageRouter);
v1Router.use("/subscriptions", subscriptionsRouter);
v1Router.use("/logs", logsRouter);
v1Router.use("/alerts", alertsRouter);
v1Router.use("/teams", teamRouter);

// v1-specific endpoints that will be deprecated
v1Router.get(
  "/user/profile",
  deprecatedEndpoint(
    "Use /users/me instead",
    "/api/v2/users/me",
    "v3"
  ),
  (req, res) => {
    // Legacy user profile endpoint
    res.json({
      message: "This is the v1 user profile endpoint",
      deprecated: true,
      alternative: "/api/v2/users/me",
    });
  }
);

export { v1Router };