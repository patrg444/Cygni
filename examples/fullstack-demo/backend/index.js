const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = process.env.DATABASE_PATH || "./data/todos.db";
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed with sample data if empty
  db.get("SELECT COUNT(*) as count FROM todos", (err, row) => {
    if (row.count === 0) {
      const stmt = db.prepare(
        "INSERT INTO todos (title, completed) VALUES (?, ?)",
      );
      stmt.run("Deploy app with Cygni", 1);
      stmt.run("Add authentication", 0);
      stmt.run("Setup monitoring", 0);
      stmt.finalize();
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "fullstack-demo-api",
    timestamp: new Date().toISOString(),
    database: "connected",
  });
});

// API Info
app.get("/api", (req, res) => {
  res.json({
    message: "🚀 Fullstack Demo API",
    version: "1.0.0",
    endpoints: {
      todos: "/api/todos",
      health: "/health",
      stats: "/api/stats",
    },
  });
});

// Get all todos
app.get("/api/todos", (req, res) => {
  db.all("SELECT * FROM todos ORDER BY created_at DESC", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      todos: rows,
      count: rows.length,
    });
  });
});

// Create todo
app.post("/api/todos", (req, res) => {
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  db.run("INSERT INTO todos (title) VALUES (?)", [title], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    res.status(201).json({
      id: this.lastID,
      title,
      completed: false,
      created_at: new Date().toISOString(),
    });
  });
});

// Update todo
app.patch("/api/todos/:id", (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  db.run(
    "UPDATE todos SET completed = ? WHERE id = ?",
    [completed ? 1 : 0, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      if (this.changes === 0) {
        res.status(404).json({ error: "Todo not found" });
        return;
      }

      res.json({ success: true });
    },
  );
});

// Delete todo
app.delete("/api/todos/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM todos WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (this.changes === 0) {
      res.status(404).json({ error: "Todo not found" });
      return;
    }

    res.json({ success: true });
  });
});

// Stats endpoint
app.get("/api/stats", (req, res) => {
  db.get(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending
    FROM todos`,
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(row);
    },
  );
});

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

// Start server
app.listen(port, () => {
  console.log(`✨ Fullstack demo API running on port ${port}`);
  console.log(`📊 Database: ${dbPath}`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
});
