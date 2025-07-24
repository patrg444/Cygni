"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const app = (0, fastify_1.default)({
    logger: true,
});
const PORT = process.env.PORT || 3001;
app.get("/health", async () => {
    return { status: "ok" };
});
app.listen({ port: Number(PORT), host: "0.0.0.0" }, (err) => {
    if (err) {
        app.log.error(err);
        process.exit(1);
    }
    app.log.info(`Auth service listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map