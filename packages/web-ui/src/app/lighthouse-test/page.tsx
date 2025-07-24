"use client";

import { useState } from "react";

interface Post {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export default function LighthouseTestPage() {
  const [posts] = useState<Post[]>([
    { id: "1", title: "Welcome to CloudExpress", content: "This is a high-performance generated UI.", author: "Admin", createdAt: new Date().toISOString() },
    { id: "2", title: "React 18 Features", content: "Using the latest React features for optimal performance.", author: "Developer", createdAt: new Date().toISOString() },
    { id: "3", title: "Tailwind CSS", content: "Styled with Tailwind for fast, responsive design.", author: "Designer", createdAt: new Date().toISOString() },
    { id: "4", title: "TypeScript Support", content: "Full TypeScript support for type safety.", author: "Engineer", createdAt: new Date().toISOString() },
    { id: "5", title: "Performance Optimized", content: "Built with performance in mind from the ground up.", author: "Architect", createdAt: new Date().toISOString() },
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Posts Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">High-performance generated UI</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex justify-between items-center">
          <div className="flex gap-4">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Create Post
            </button>
            <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
              Filter
            </button>
          </div>
          <div className="text-sm text-gray-600">
            Showing {posts.length} posts
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
              <h2 className="text-xl font-semibold mb-2 text-gray-900">{post.title}</h2>
              <p className="text-gray-600 mb-4">{post.content}</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">By {post.author}</span>
                <span className="text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                  Edit
                </button>
                <button className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>

        <nav className="mt-8 flex justify-center">
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Previous
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">1</button>
            <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              2
            </button>
            <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              3
            </button>
            <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Next
            </button>
          </div>
        </nav>
      </main>

      <footer className="mt-16 bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">© 2024 CloudExpress. Built for performance.</p>
        </div>
      </footer>
    </div>
  );
}