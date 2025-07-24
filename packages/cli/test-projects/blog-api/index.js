const express = require("express");
const app = express();

app.use(express.json());

// In-memory storage
let posts = [
  {
    id: "1",
    title: "First Post",
    content: "Hello World",
    author: "Admin",
    published: true,
  },
  {
    id: "2",
    title: "Second Post",
    content: "Another post",
    author: "User",
    published: false,
  },
];

// GET /posts - List all posts
app.get("/posts", (req, res) => {
  res.json(posts);
});

// GET /posts/:id - Get a single post
app.get("/posts/:id", (req, res) => {
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }
  res.json(post);
});

// POST /posts - Create a new post
app.post("/posts", (req, res) => {
  const newPost = {
    id: String(posts.length + 1),
    title: req.body.title,
    content: req.body.content,
    author: req.body.author || "Anonymous",
    published: req.body.published || false,
    createdAt: new Date().toISOString(),
  };
  posts.push(newPost);
  res.status(201).json(newPost);
});

// PUT /posts/:id - Update a post
app.put("/posts/:id", (req, res) => {
  const index = posts.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Post not found" });
  }
  posts[index] = { ...posts[index], ...req.body, id: req.params.id };
  res.json(posts[index]);
});

// DELETE /posts/:id - Delete a post
app.delete("/posts/:id", (req, res) => {
  const index = posts.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Post not found" });
  }
  posts.splice(index, 1);
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Blog API running on port ${PORT}`);
});
