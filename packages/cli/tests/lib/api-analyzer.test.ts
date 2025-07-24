import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ApiAnalyzer } from "../../src/lib/api-analyzer";
import { RealFileSystem } from "../services/real-file-system";
import path from "path";

describe("API Analyzer - Real Implementation", () => {
  let fileSystem: RealFileSystem;
  let testDir: string;
  let analyzer: ApiAnalyzer;

  beforeEach(async () => {
    fileSystem = new RealFileSystem("api-analyzer");
    testDir = await fileSystem.createTestDir();
    analyzer = new ApiAnalyzer(testDir);
  });

  afterEach(async () => {
    await fileSystem.cleanup();
  });

  describe("Level 1: Simple API Detection (Basic CRUD)", () => {
    it("should detect basic Express routes", async () => {
      // Create a simple Express app
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "simple-api",
          dependencies: {
            express: "^4.18.0",
          },
        }),
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const app = express();

// Basic CRUD endpoints
app.get('/users', (req, res) => {
  res.json({ users: [] });
});

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});

app.post('/users', (req, res) => {
  res.status(201).json({ created: true });
});

app.put('/users/:id', (req, res) => {
  res.json({ updated: true });
});

app.delete('/users/:id', (req, res) => {
  res.status(204).send();
});

app.listen(3000);
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("express");
      expect(result.endpoints).toHaveLength(5);

      // Check each endpoint
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/users",
          file: "app.js",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/users/:id",
          file: "app.js",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/users",
          file: "app.js",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "PUT",
          path: "/users/:id",
          file: "app.js",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "DELETE",
          path: "/users/:id",
          file: "app.js",
        }),
      );
    });

    it("should detect Flask routes", async () => {
      await fileSystem.createFile("requirements.txt", "flask==2.3.0\n");

      await fileSystem.createFile(
        "app.py",
        `
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/products')
def get_products():
    return jsonify({"products": []})

@app.route('/products/<int:id>')
def get_product(id):
    return jsonify({"id": id})

@app.route('/products', methods=['POST'])
def create_product():
    return jsonify({"created": True}), 201

@app.route('/products/<int:id>', methods=['PUT'])
def update_product(id):
    return jsonify({"updated": True})

@app.route('/products/<int:id>', methods=['DELETE'])
def delete_product(id):
    return '', 204

if __name__ == '__main__':
    app.run()
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("flask");
      expect(result.endpoints).toHaveLength(5);

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/products",
          file: "app.py",
        }),
      );
    });

    it("should detect Next.js API routes", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "nextjs-api",
          dependencies: {
            next: "^13.0.0",
          },
        }),
      );

      // App Router style
      await fileSystem.createDir("app/api/items");
      await fileSystem.createFile(
        "app/api/items/route.ts",
        `
export async function GET() {
  return Response.json({ items: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ created: true }, { status: 201 });
}
      `,
      );

      await fileSystem.createDir("app/api/items/[id]");
      await fileSystem.createFile(
        "app/api/items/[id]/route.ts",
        `
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  return Response.json({ updated: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  return new Response(null, { status: 204 });
}
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("nextjs");
      expect(result.endpoints).toHaveLength(5);

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/api/items",
          file: "app/api/items/route.ts",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/api/items",
          file: "app/api/items/route.ts",
        }),
      );
    });
  });

  describe("Level 2: Medium Complexity (Auth & Middleware)", () => {
    it("should detect Express middleware and authentication", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "medium-api",
          dependencies: {
            express: "^4.18.0",
            jsonwebtoken: "^9.0.0",
            passport: "^0.6.0",
            "passport-jwt": "^4.0.0",
          },
        }),
      );

      await fileSystem.createFile(
        "middleware/auth.js",
        `
const passport = require('passport');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET
};

passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
  // User validation logic
  return done(null, user);
}));

module.exports = {
  authenticate: passport.authenticate('jwt', { session: false })
};
      `,
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { authenticate } = require('./middleware/auth');

const app = express();

// Global middleware
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

// Public endpoints
app.post('/auth/login', (req, res) => {
  // Login logic
  res.json({ token: 'jwt-token' });
});

app.post('/auth/register', (req, res) => {
  // Registration logic
  res.status(201).json({ user: {} });
});

// Protected endpoints with middleware
app.get('/profile', authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.put('/profile', authenticate, (req, res) => {
  res.json({ updated: true });
});

// Admin endpoints with multiple middleware
app.get('/admin/users', [authenticate, requireAdmin], (req, res) => {
  res.json({ users: [] });
});

app.delete('/admin/users/:id', [authenticate, requireAdmin], (req, res) => {
  res.status(204).send();
});

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.listen(3000);
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("express");
      expect(result.authentication).toEqual({
        type: "jwt",
        strategy: "passport",
      });

      expect(result.middleware).toContain("cors");
      expect(result.middleware).toContain("helmet");
      expect(result.middleware).toContain("compression");
      expect(result.middleware).toContain("json-parser");

      // Check endpoints with middleware
      const profileEndpoint = result.endpoints.find(
        (e) => e.path === "/profile" && e.method === "GET",
      );
      expect(profileEndpoint?.middleware).toContain("authenticate");

      const adminEndpoint = result.endpoints.find(
        (e) => e.path === "/admin/users" && e.method === "GET",
      );
      expect(adminEndpoint?.middleware).toContain("authenticate");
      expect(adminEndpoint?.middleware).toContain("requireAdmin");
    });

    it("should detect router-based organization", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "router-api",
          dependencies: {
            express: "^4.18.0",
          },
        }),
      );

      await fileSystem.createDir("routes");

      await fileSystem.createFile(
        "routes/users.js",
        `
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ users: [] });
});

router.post('/', authenticate, (req, res) => {
  res.status(201).json({ created: true });
});

router.get('/:id', (req, res) => {
  res.json({ id: req.params.id });
});

router.put('/:id', authenticate, (req, res) => {
  res.json({ updated: true });
});

router.delete('/:id', [authenticate, adminOnly], (req, res) => {
  res.status(204).send();
});

module.exports = router;
      `,
      );

      await fileSystem.createFile(
        "routes/products.js",
        `
const express = require('express');
const router = express.Router();

router.get('/', cache('5 minutes'), (req, res) => {
  res.json({ products: [] });
});

router.get('/featured', cache('1 hour'), (req, res) => {
  res.json({ featured: [] });
});

router.post('/', authenticate, validateProduct, (req, res) => {
  res.status(201).json({ created: true });
});

module.exports = router;
      `,
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const usersRouter = require('./routes/users');
const productsRouter = require('./routes/products');

const app = express();

app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);

app.listen(3000);
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("express");

      // Should detect all user routes
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/",
          file: "routes/users.js",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/",
          file: "routes/users.js",
          middleware: ["authenticate"],
        }),
      );

      // Should detect product routes
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/",
          file: "routes/products.js",
          middleware: ["cache"],
        }),
      );
    });

    it("should detect Django REST framework patterns", async () => {
      await fileSystem.createFile(
        "requirements.txt",
        `
django==4.2
djangorestframework==3.14
django-cors-headers==4.0
      `,
      );

      await fileSystem.createFile(
        "api/urls.py",
        `
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'posts', views.PostViewSet)

urlpatterns = [
    path('auth/login/', views.LoginView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/refresh/', views.RefreshTokenView.as_view()),
    path('profile/', views.ProfileView.as_view()),
    path('profile/avatar/', views.AvatarUploadView.as_view()),
    path('', include(router.urls)),
]
      `,
      );

      await fileSystem.createFile(
        "project/urls.py",
        `
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('api.urls')),
    path('api-auth/', include('rest_framework.urls')),
]
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("django");

      // Should detect API versioning
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          path: "/api/v1/auth/login/",
          method: "ALL",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          path: "/api/v1/profile/",
          method: "ALL",
        }),
      );
    });
  });

  describe("Level 3: Complex API Detection (GraphQL, WebSockets, Microservices)", () => {
    it("should detect GraphQL endpoints", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "graphql-api",
          dependencies: {
            express: "^4.18.0",
            "apollo-server-express": "^3.12.0",
            graphql: "^16.6.0",
          },
        }),
      );

      await fileSystem.createFile(
        "schema.js",
        `
const { gql } = require('apollo-server-express');

const typeDefs = gql\`
  type User {
    id: ID!
    name: String!
    email: String!
    posts: [Post!]!
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author: User!
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    text: String!
    author: User!
    post: Post!
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    posts(limit: Int, offset: Int): [Post!]!
    post(id: ID!): Post
    searchPosts(query: String!): [Post!]!
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): Boolean!
    
    createPost(input: CreatePostInput!): Post!
    updatePost(id: ID!, input: UpdatePostInput!): Post!
    deletePost(id: ID!): Boolean!
    
    addComment(postId: ID!, text: String!): Comment!
  }

  type Subscription {
    postAdded: Post!
    commentAdded(postId: ID!): Comment!
  }

  input CreateUserInput {
    name: String!
    email: String!
    password: String!
  }

  input UpdateUserInput {
    name: String
    email: String
  }

  input CreatePostInput {
    title: String!
    content: String!
  }

  input UpdatePostInput {
    title: String
    content: String
  }
\`;

module.exports = typeDefs;
      `,
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');

const app = express();

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    subscriptions: {
      path: '/graphql/subscriptions'
    }
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  // REST endpoints alongside GraphQL
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/webhook/github', (req, res) => {
    // GitHub webhook handler
    res.status(200).send();
  });

  app.listen(4000);
}

startServer();
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("express");
      expect(result.graphql).toEqual({
        enabled: true,
        path: "/graphql",
      });

      // Should still detect REST endpoints
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/health",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/webhook/github",
        }),
      );
    });

    it("should detect WebSocket endpoints", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "websocket-api",
          dependencies: {
            express: "^4.18.0",
            "socket.io": "^4.6.0",
            ws: "^8.13.0",
          },
        }),
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  },
  path: "/socket.io"
});

// REST endpoints
app.get('/api/status', (req, res) => {
  res.json({ 
    connections: io.engine.clientsCount,
    rooms: Array.from(io.sockets.adapter.rooms.keys())
  });
});

app.post('/api/broadcast', authenticate, (req, res) => {
  io.emit('broadcast', req.body.message);
  res.json({ sent: true });
});

// Socket.IO namespaces
const chatNamespace = io.of('/chat');
const adminNamespace = io.of('/admin');

chatNamespace.on('connection', (socket) => {
  socket.on('join_room', (room) => {
    socket.join(room);
  });
  
  socket.on('message', (data) => {
    chatNamespace.to(data.room).emit('message', data);
  });
});

// Raw WebSocket server
const wss = new WebSocket.Server({ 
  server: httpServer,
  path: '/ws'
});

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    // Echo message to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
});

httpServer.listen(3000);
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("express");
      expect(result.websockets).toEqual({
        enabled: true,
        path: "/ws", // Should detect the raw WebSocket path
      });

      // Should detect REST endpoints
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/api/status",
        }),
      );

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/api/broadcast",
          middleware: ["authenticate"],
        }),
      );
    });

    it("should detect microservices patterns", async () => {
      // Service 1: User Service
      await fileSystem.createDir("services/user-service");
      await fileSystem.createFile(
        "services/user-service/package.json",
        JSON.stringify({
          name: "user-service",
          dependencies: {
            express: "^4.18.0",
            amqplib: "^0.10.0",
          },
        }),
      );

      await fileSystem.createFile(
        "services/user-service/app.js",
        `
const express = require('express');
const amqp = require('amqplib');

const app = express();

// Health check for service mesh
app.get('/health', (req, res) => {
  res.json({ service: 'user-service', status: 'healthy' });
});

// User service endpoints
app.get('/users', async (req, res) => {
  res.json({ users: [] });
});

app.get('/users/:id', async (req, res) => {
  res.json({ id: req.params.id });
});

app.post('/users', async (req, res) => {
  // Publish event to message queue
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  await channel.assertQueue('user.created');
  await channel.sendToQueue('user.created', Buffer.from(JSON.stringify({
    userId: 'new-user-id',
    timestamp: Date.now()
  })));
  
  res.status(201).json({ created: true });
});

// Internal service communication
app.get('/internal/users/:id/validate', (req, res) => {
  res.json({ valid: true });
});

app.listen(3001);
      `,
      );

      // Service 2: Order Service
      await fileSystem.createDir("services/order-service");
      await fileSystem.createFile(
        "services/order-service/package.json",
        JSON.stringify({
          name: "order-service",
          dependencies: {
            fastify: "^4.17.0",
            "fastify-cors": "^6.1.0",
          },
        }),
      );

      await fileSystem.createFile(
        "services/order-service/app.js",
        `
const fastify = require('fastify')();

// Health check
fastify.get('/health', async (request, reply) => {
  return { service: 'order-service', status: 'healthy' };
});

// Order endpoints
fastify.get('/orders', async (request, reply) => {
  return { orders: [] };
});

fastify.post('/orders', async (request, reply) => {
  // Call user service to validate user
  const userResponse = await fetch('http://user-service:3001/internal/users/' + request.body.userId + '/validate');
  const userData = await userResponse.json();
  
  if (!userData.valid) {
    reply.code(400);
    return { error: 'Invalid user' };
  }
  
  reply.code(201);
  return { created: true };
});

// Webhook for payment service
fastify.post('/webhooks/payment-completed', async (request, reply) => {
  // Process payment completion
  return { processed: true };
});

fastify.listen({ port: 3002 });
      `,
      );

      // API Gateway
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "api-gateway",
          dependencies: {
            express: "^4.18.0",
            "express-http-proxy": "^1.6.3",
            "express-rate-limit": "^6.7.0",
          },
        }),
      );

      await fileSystem.createFile(
        "gateway.js",
        `
const express = require('express');
const proxy = require('express-http-proxy');
const rateLimit = require('express-rate-limit');

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});

app.use('/api', limiter);

// Service routing
app.use('/api/users', proxy('http://user-service:3001', {
  proxyReqPathResolver: (req) => '/users' + req.url
}));

app.use('/api/orders', proxy('http://order-service:3002', {
  proxyReqPathResolver: (req) => '/orders' + req.url
}));

// Gateway health check
app.get('/health', (req, res) => {
  res.json({ 
    service: 'api-gateway',
    status: 'healthy',
    upstreams: ['user-service', 'order-service']
  });
});

// Service discovery endpoint
app.get('/services', (req, res) => {
  res.json({
    services: [
      { name: 'user-service', url: 'http://user-service:3001', health: '/health' },
      { name: 'order-service', url: 'http://order-service:3002', health: '/health' }
    ]
  });
});

app.listen(3000);
      `,
      );

      const result = await analyzer.analyze();

      // Should detect this is a microservices setup
      expect(result.framework).toBe("express");

      // Should find endpoints from all services
      const userServiceEndpoints = result.endpoints.filter((e) =>
        e.file.includes("user-service"),
      );
      expect(userServiceEndpoints.length).toBeGreaterThan(0);

      const orderServiceEndpoints = result.endpoints.filter((e) =>
        e.file.includes("order-service"),
      );
      expect(orderServiceEndpoints.length).toBeGreaterThan(0);

      // Should detect API gateway patterns
      const gatewayEndpoints = result.endpoints.filter(
        (e) => e.file === "gateway.js",
      );
      expect(gatewayEndpoints).toContainEqual(
        expect.objectContaining({
          path: "/health",
        }),
      );
      expect(gatewayEndpoints).toContainEqual(
        expect.objectContaining({
          path: "/services",
        }),
      );
    });

    it("should detect Rails API with complex patterns", async () => {
      await fileSystem.createFile(
        "Gemfile",
        `
source 'https://rubygems.org'

gem 'rails', '~> 7.0'
gem 'pg'
gem 'redis'
gem 'sidekiq'
gem 'jwt'
gem 'rack-cors'
gem 'graphql'
      `,
      );

      await fileSystem.createDir("config");
      await fileSystem.createFile(
        "config/routes.rb",
        `
Rails.application.routes.draw do
  # GraphQL endpoint
  post "/graphql", to: "graphql#execute"
  
  # API versioning
  namespace :api do
    namespace :v1 do
      # Authentication
      post 'auth/login', to: 'authentication#login'
      post 'auth/logout', to: 'authentication#logout'
      post 'auth/refresh', to: 'authentication#refresh'
      
      # Resources with nested routes
      resources :users do
        resources :posts do
          resources :comments
        end
        member do
          post :follow
          delete :unfollow
          get :followers
          get :following
        end
      end
      
      # Custom routes
      get 'search', to: 'search#index'
      get 'trending/posts', to: 'trending#posts'
      get 'trending/users', to: 'trending#users'
      
      # Admin namespace
      namespace :admin do
        resources :users
        resources :posts
        resources :reports
        get 'dashboard', to: 'dashboard#index'
      end
    end
    
    namespace :v2 do
      resources :users, only: [:index, :show]
      resources :posts, only: [:index, :show]
    end
  end
  
  # Webhooks
  post 'webhooks/stripe', to: 'webhooks#stripe'
  post 'webhooks/github', to: 'webhooks#github'
  
  # ActionCable WebSocket
  mount ActionCable.server => '/cable'
  
  # Health check
  get 'health', to: 'health#check'
end
      `,
      );

      const result = await analyzer.analyze();

      expect(result.framework).toBe("rails");

      // Should detect GraphQL
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/graphql",
        }),
      );

      // Should detect nested resources
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "GET",
          path: "/api/v1/users",
        }),
      );

      // Should detect custom member routes
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/api/v1/users/:id/follow",
        }),
      );

      // Should detect API versioning
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          path: "/api/v2/users",
        }),
      );

      // Should detect webhooks
      expect(result.endpoints).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/webhooks/stripe",
        }),
      );
    });
  });

  describe("OpenAPI/Swagger Generation", () => {
    it("should generate OpenAPI spec from detected endpoints", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "openapi-test",
          dependencies: {
            express: "^4.18.0",
            jsonwebtoken: "^9.0.0",
          },
        }),
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();

app.use(express.json());

// Public endpoints
app.post('/auth/login', (req, res) => {
  const token = jwt.sign({ userId: 1 }, 'secret');
  res.json({ token });
});

// Protected endpoints
app.get('/users', authenticate, (req, res) => {
  res.json({ users: [] });
});

app.get('/users/:id', authenticate, (req, res) => {
  res.json({ id: req.params.id });
});

app.post('/users', authenticate, adminOnly, (req, res) => {
  res.status(201).json({ created: true });
});

function authenticate(req, res, next) {
  // JWT validation
  next();
}

function adminOnly(req, res, next) {
  // Admin check
  next();
}

app.listen(3000);
      `,
      );

      const result = await analyzer.analyze();
      const openApiSpec = await analyzer.generateOpenApiSpec(result);

      expect(openApiSpec.openapi).toBe("3.0.0");
      expect(openApiSpec.info.title).toBe("Auto-generated API Documentation");
      expect(openApiSpec.info.description).toContain("4 endpoints");
      expect(openApiSpec.info.description).toContain("express");

      // Check security schemes
      expect(openApiSpec.components.securitySchemes.bearerAuth).toEqual({
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      });

      // Check endpoints
      expect(openApiSpec.paths["/auth/login"]).toBeDefined();
      expect(openApiSpec.paths["/auth/login"].post).toBeDefined();

      expect(openApiSpec.paths["/users"]).toBeDefined();
      expect(openApiSpec.paths["/users"].get.security).toEqual([
        { bearerAuth: [] },
      ]);
      expect(openApiSpec.paths["/users"].post.security).toEqual([
        { bearerAuth: [] },
      ]);

      expect(openApiSpec.paths["/users/:id"]).toBeDefined();
      expect(openApiSpec.paths["/users/:id"].get.parameters).toContainEqual({
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    });
  });

  describe("CloudExpress Configuration Generation", () => {
    it("should generate CloudExpress config from analysis", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          name: "cloudexpress-config-test",
          dependencies: {
            express: "^4.18.0",
            "socket.io": "^4.6.0",
          },
        }),
      );

      await fileSystem.createFile(
        "app.js",
        `
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { path: "/ws" });

app.use(express.json());

// API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/users', authenticate, (req, res) => {
  res.json({ users: [] });
});

io.on('connection', (socket) => {
  console.log('Client connected');
});

httpServer.listen(3000);
      `,
      );

      const result = await analyzer.analyze();
      const cloudExpressConfig = analyzer.generateCloudExpressConfig(result);

      expect(cloudExpressConfig.name).toBe(path.basename(testDir));
      expect(cloudExpressConfig.framework).toBe("express");

      expect(cloudExpressConfig.services.api.endpoints).toHaveLength(2);
      expect(cloudExpressConfig.services.api.middleware).toContain(
        "json-parser",
      );

      expect(cloudExpressConfig.services.websocket).toEqual({
        enabled: true,
        path: "/ws",
      });
    });
  });

  describe("Framework Detection", () => {
    it("should detect Fastify framework", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          dependencies: { fastify: "^4.0.0" },
        }),
      );

      const result = await analyzer.analyze();
      expect(result.framework).toBe("fastify");
    });

    it("should detect Django framework", async () => {
      await fileSystem.createFile("requirements.txt", "django==4.2.0\n");

      const result = await analyzer.analyze();
      expect(result.framework).toBe("django");
    });

    it("should detect NestJS framework", async () => {
      await fileSystem.createFile(
        "package.json",
        JSON.stringify({
          dependencies: { "@nestjs/core": "^9.0.0" },
        }),
      );

      const result = await analyzer.analyze();
      expect(result.framework).toBe("nestjs");
    });

    it("should return unknown for unrecognized frameworks", async () => {
      await fileSystem.createFile(
        "main.go",
        `
package main

import "net/http"

func main() {
    http.HandleFunc("/", handler)
    http.ListenAndServe(":8080", nil)
}
      `,
      );

      const result = await analyzer.analyze();
      expect(result.framework).toBe("unknown");
    });
  });
});
