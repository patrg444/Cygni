import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

// Configure axios base URL for production
if (import.meta.env.PROD) {
  axios.defaults.baseURL = window.location.origin;
}

function App() {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState("checking");

  useEffect(() => {
    checkHealth();
    fetchTodos();
    fetchStats();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await axios.get("/health");
      setApiStatus("connected");
    } catch (error) {
      setApiStatus("error");
    }
  };

  const fetchTodos = async () => {
    try {
      const response = await axios.get("/api/todos");
      setTodos(response.data.todos);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching todos:", error);
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get("/api/stats");
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    try {
      const response = await axios.post("/api/todos", { title: newTodo });
      setTodos([response.data, ...todos]);
      setNewTodo("");
      fetchStats();
    } catch (error) {
      console.error("Error adding todo:", error);
    }
  };

  const toggleTodo = async (id, completed) => {
    try {
      await axios.patch(`/api/todos/${id}`, { completed: !completed });
      setTodos(
        todos.map((todo) =>
          todo.id === id ? { ...todo, completed: !completed } : todo,
        ),
      );
      fetchStats();
    } catch (error) {
      console.error("Error updating todo:", error);
    }
  };

  const deleteTodo = async (id) => {
    try {
      await axios.delete(`/api/todos/${id}`);
      setTodos(todos.filter((todo) => todo.id !== id));
      fetchStats();
    } catch (error) {
      console.error("Error deleting todo:", error);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>🚀 Cygni Fullstack Demo</h1>
        <p className="subtitle">React + Express + SQLite deployed in minutes</p>
        <div className={`api-status ${apiStatus}`}>
          API:{" "}
          {apiStatus === "connected"
            ? "✅ Connected"
            : apiStatus === "checking"
              ? "⏳ Checking..."
              : "❌ Error"}
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.completed}</span>
          <span className="stat-label">Completed</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.pending}</span>
          <span className="stat-label">Pending</span>
        </div>
      </div>

      <form onSubmit={addTodo} className="add-todo">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new todo..."
          className="todo-input"
        />
        <button type="submit" className="add-button">
          Add
        </button>
      </form>

      {loading ? (
        <div className="loading">Loading todos...</div>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`todo-item ${todo.completed ? "completed" : ""}`}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id, todo.completed)}
                className="todo-checkbox"
              />
              <span className="todo-title">{todo.title}</span>
              <button
                onClick={() => deleteTodo(todo.id)}
                className="delete-button"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer>
        <p>
          Deployed with{" "}
          <a href="https://cygni.dev" target="_blank">
            Cygni
          </a>{" "}
          | View on{" "}
          <a href="https://github.com/cygni/fullstack-demo" target="_blank">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
