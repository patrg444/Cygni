export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Welcome to Cygni
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">Deploy Instantly</h2>
            <p className="text-gray-600">
              Push your code and see it live in seconds with automatic SSL and
              global CDN.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">Scale Effortlessly</h2>
            <p className="text-gray-600">
              Auto-scaling infrastructure that grows with your application
              needs.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">Monitor Everything</h2>
            <p className="text-gray-600">
              Built-in analytics, logs, and performance monitoring at your
              fingertips.
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <h3 className="text-lg font-semibold mb-4">Deploy this example:</h3>
          <code className="bg-gray-100 px-4 py-2 rounded">cygni deploy</code>
        </div>
      </div>
    </main>
  );
}
