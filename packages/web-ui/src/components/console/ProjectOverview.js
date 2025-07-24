"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectOverview = ProjectOverview;
const react_icons_1 = require("@radix-ui/react-icons");
function ProjectOverview({ data }) {
    if (!data)
        return null;
    const { framework, endpoints = [], authentication, middleware = [], websockets, graphql, } = data;
    const healthChecks = [
        {
            name: "Framework Detection",
            status: framework && framework !== "unknown" ? "success" : "error",
            value: framework || "Not detected",
            description: framework
                ? `Detected ${framework} framework`
                : "Unable to detect framework",
        },
        {
            name: "API Endpoints",
            status: endpoints.length > 0 ? "success" : "warning",
            value: `${endpoints.length} endpoints`,
            description: endpoints.length > 0
                ? "API endpoints successfully detected"
                : "No API endpoints found",
        },
        {
            name: "Authentication",
            status: authentication ? "success" : "info",
            value: authentication?.type || "None",
            description: authentication
                ? `${authentication.type} authentication configured`
                : "No authentication detected",
        },
        {
            name: "Middleware",
            status: middleware.length > 0 ? "success" : "info",
            value: middleware.length > 0 ? middleware.join(", ") : "None",
            description: middleware.length > 0
                ? "Middleware stack detected"
                : "No middleware detected",
        },
    ];
    const features = [];
    if (websockets?.enabled) {
        features.push({
            name: "WebSockets",
            enabled: true,
            path: websockets.path,
        });
    }
    if (graphql?.enabled) {
        features.push({
            name: "GraphQL",
            enabled: true,
            path: graphql.path,
        });
    }
    const getStatusIcon = (status) => {
        switch (status) {
            case "success":
                return <react_icons_1.CheckCircledIcon className="w-5 h-5 text-green-600"/>;
            case "error":
                return <react_icons_1.CrossCircledIcon className="w-5 h-5 text-red-600"/>;
            case "warning":
                return <react_icons_1.ExclamationTriangleIcon className="w-5 h-5 text-yellow-600"/>;
            default:
                return <react_icons_1.InfoCircledIcon className="w-5 h-5 text-blue-600"/>;
        }
    };
    const getStatusColor = (status) => {
        switch (status) {
            case "success":
                return "bg-green-50 border-green-200";
            case "error":
                return "bg-red-50 border-red-200";
            case "warning":
                return "bg-yellow-50 border-yellow-200";
            default:
                return "bg-blue-50 border-blue-200";
        }
    };
    return (<div className="space-y-6">
      {/* Project Summary Card */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Project Analysis Summary</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Framework</p>
            <p className="text-xl font-semibold capitalize">
              {framework || "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Endpoints</p>
            <p className="text-xl font-semibold">{endpoints.length}</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {endpoints.filter((e) => e.method === "GET").length}
            </p>
            <p className="text-xs text-gray-600">GET</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {endpoints.filter((e) => e.method === "POST").length}
            </p>
            <p className="text-xs text-gray-600">POST</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {endpoints.filter((e) => e.method === "PUT").length}
            </p>
            <p className="text-xs text-gray-600">PUT</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {endpoints.filter((e) => e.method === "DELETE").length}
            </p>
            <p className="text-xs text-gray-600">DELETE</p>
          </div>
        </div>
      </div>

      {/* Health Checks */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Configuration Status</h2>
        <div className="space-y-3">
          {healthChecks.map((check) => (<div key={check.name} className={`flex items-start gap-3 p-4 rounded-lg border ${getStatusColor(check.status)}`}>
              {getStatusIcon(check.status)}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{check.name}</h3>
                  <span className="text-sm font-medium">{check.value}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {check.description}
                </p>
              </div>
            </div>))}
        </div>
      </div>

      {/* Advanced Features */}
      {features.length > 0 && (<div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Advanced Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature) => (<div key={feature.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <react_icons_1.CheckCircledIcon className="w-5 h-5 text-green-600"/>
                  <span className="font-medium">{feature.name}</span>
                </div>
                <span className="text-sm text-gray-600">{feature.path}</span>
              </div>))}
          </div>
        </div>)}

      {/* File Structure Preview */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Detected Files</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Configuration Files
            </h3>
            <ul className="space-y-1">
              {data.detectedFiles?.config?.map((file) => (<li key={file} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                  {file}
                </li>))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Source Files
            </h3>
            <ul className="space-y-1">
              {data.detectedFiles?.source?.map((file) => (<li key={file} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                  {file}
                </li>))}
            </ul>
          </div>
        </div>
      </div>
    </div>);
}
//# sourceMappingURL=ProjectOverview.js.map