"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndpointDetailModal = EndpointDetailModal;
const react_1 = require("react");
const react_icons_1 = require("@radix-ui/react-icons");
function EndpointDetailModal({ endpoint, onClose, }) {
    const [activeTab, setActiveTab] = (0, react_1.useState)("details");
    const [copied, setCopied] = (0, react_1.useState)(false);
    const [testResult, setTestResult] = (0, react_1.useState)(null);
    const [testing, setTesting] = (0, react_1.useState)(false);
    const getMethodColor = (method) => {
        const colors = {
            GET: "bg-green-100 text-green-800",
            POST: "bg-blue-100 text-blue-800",
            PUT: "bg-yellow-100 text-yellow-800",
            PATCH: "bg-orange-100 text-orange-800",
            DELETE: "bg-red-100 text-red-800",
        };
        return colors[method] || "bg-gray-100 text-gray-800";
    };
    const generateCurlCommand = () => {
        const baseUrl = "http://localhost:3000"; // This would come from config
        return `curl -X ${endpoint.method} ${baseUrl}${endpoint.path} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN"${endpoint.method !== "GET" ? ' \\\n  -d \'{"example": "data"}\'' : ""}`;
    };
    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(generateCurlCommand());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const runTest = async () => {
        setTesting(true);
        try {
            // Simulate API test - in real app, this would call the actual endpoint
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setTestResult({
                status: 200,
                statusText: "OK",
                headers: {
                    "Content-Type": "application/json",
                    "X-Request-ID": "123456789",
                },
                body: {
                    success: true,
                    data: {
                        id: 1,
                        message: "Test response",
                        timestamp: new Date().toISOString(),
                    },
                },
                duration: 145,
            });
        }
        catch (error) {
            setTestResult({
                error: true,
                message: "Failed to connect to endpoint",
            });
        }
        setTesting(false);
    };
    return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 text-sm font-semibold rounded-md ${getMethodColor(endpoint.method)}`}>
              {endpoint.method}
            </span>
            <code className="text-lg font-mono">{endpoint.path}</code>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <react_icons_1.Cross2Icon className="w-5 h-5"/>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <nav className="flex px-6">
            {["details", "request", "response", "test"].map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab
                ? "text-blue-600 border-blue-600"
                : "text-gray-500 border-transparent hover:text-gray-700"}`}>
                  {tab}
                </button>))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: "calc(90vh - 200px)" }}>
          {activeTab === "details" && (<div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  File Location
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <react_icons_1.CodeIcon className="w-4 h-4 text-gray-400"/>
                  <code className="bg-gray-100 px-2 py-1 rounded">
                    {endpoint.file}
                    {endpoint.line && `:${endpoint.line}`}
                  </code>
                </div>
              </div>

              {endpoint.description && (<div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Description
                  </h3>
                  <p className="text-sm text-gray-600">
                    {endpoint.description}
                  </p>
                </div>)}

              {endpoint.middleware && endpoint.middleware.length > 0 && (<div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Middleware
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {endpoint.middleware.map((mw, index) => (<span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm">
                        {mw}
                      </span>))}
                  </div>
                </div>)}

              {endpoint.authentication && (<div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Authentication
                  </h3>
                  <p className="text-sm text-gray-600">
                    This endpoint requires authentication. Include a valid
                    Bearer token in the Authorization header.
                  </p>
                </div>)}

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  cURL Command
                </h3>
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                    {generateCurlCommand()}
                  </pre>
                  <button onClick={copyToClipboard} className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                    {copied ? (<react_icons_1.CheckIcon className="w-4 h-4 text-green-400"/>) : (<react_icons_1.CopyIcon className="w-4 h-4 text-gray-300"/>)}
                  </button>
                </div>
              </div>
            </div>)}

          {activeTab === "request" && (<div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Headers
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <code className="text-sm">
                    <div>Content-Type: application/json</div>
                    {endpoint.authentication && (<div>Authorization: Bearer YOUR_TOKEN</div>)}
                  </code>
                </div>
              </div>

              {endpoint.method !== "GET" && (<div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Request Body
                  </h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                    <pre className="text-sm">
                      {`{
  "example": "data",
  "nested": {
    "field": "value"
  }
}`}
                    </pre>
                  </div>
                </div>)}

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Query Parameters
                </h3>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input type="text" placeholder="Parameter name" className="flex-1 px-3 py-2 border rounded-md text-sm"/>
                    <input type="text" placeholder="Value" className="flex-1 px-3 py-2 border rounded-md text-sm"/>
                  </div>
                </div>
              </div>
            </div>)}

          {activeTab === "response" && (<div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Example Response
                </h3>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                  <pre className="text-sm">
                    {`{
  "success": true,
  "data": {
    "id": 123,
    "name": "Example Item",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}`}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Response Headers
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <code className="text-sm">
                    <div>Content-Type: application/json</div>
                    <div>
                      X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
                    </div>
                    <div>X-RateLimit-Limit: 1000</div>
                    <div>X-RateLimit-Remaining: 999</div>
                  </code>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Status Codes
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-mono">
                      200
                    </span>
                    <span className="text-sm text-gray-600">Success</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-mono">
                      400
                    </span>
                    <span className="text-sm text-gray-600">Bad Request</span>
                  </div>
                  {endpoint.authentication && (<div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-mono">
                        401
                      </span>
                      <span className="text-sm text-gray-600">
                        Unauthorized
                      </span>
                    </div>)}
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-mono">
                      500
                    </span>
                    <span className="text-sm text-gray-600">
                      Internal Server Error
                    </span>
                  </div>
                </div>
              </div>
            </div>)}

          {activeTab === "test" && (<div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Test this endpoint directly from the console. The request will
                  be sent to your local development server.
                </p>
              </div>

              <div className="flex justify-center">
                <button onClick={runTest} disabled={testing} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {testing ? (<>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Testing...
                    </>) : (<>
                      <react_icons_1.PlayIcon className="w-4 h-4"/>
                      Run Test
                    </>)}
                </button>
              </div>

              {testResult && (<div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-md text-sm font-medium ${testResult.error
                    ? "bg-red-100 text-red-800"
                    : "bg-green-100 text-green-800"}`}>
                      {testResult.error
                    ? "Error"
                    : `${testResult.status} ${testResult.statusText}`}
                    </span>
                    {testResult.duration && (<span className="text-sm text-gray-600">
                        {testResult.duration}ms
                      </span>)}
                  </div>

                  {testResult.headers && (<div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Response Headers
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <code className="text-sm">
                          {Object.entries(testResult.headers).map(([key, value]) => (<div key={key}>
                                {key}: {String(value)}
                              </div>))}
                        </code>
                      </div>
                    </div>)}

                  {testResult.body && (<div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Response Body
                      </h4>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg">
                        <pre className="text-sm">
                          {JSON.stringify(testResult.body, null, 2)}
                        </pre>
                      </div>
                    </div>)}

                  {testResult.error && (<div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800">
                        {testResult.message}
                      </p>
                    </div>)}
                </div>)}
            </div>)}
        </div>
      </div>
    </div>);
}
//# sourceMappingURL=EndpointDetailModal.js.map