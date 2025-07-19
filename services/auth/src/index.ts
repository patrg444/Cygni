import Fastify from "fastify";

const app = Fastify({
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
