"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiEndpointsList = ApiEndpointsList;
const react_1 = require("react");
const react_icons_1 = require("@radix-ui/react-icons");
const EndpointDetailModal_1 = require("./EndpointDetailModal");
function ApiEndpointsList({ endpoints }) {
    const [searchTerm, setSearchTerm] = (0, react_1.useState)("");
    const [selectedMethod, setSelectedMethod] = (0, react_1.useState)("all");
    const [selectedEndpoint, setSelectedEndpoint] = (0, react_1.useState)(null);
    const methods = ["all", "GET", "POST", "PUT", "PATCH", "DELETE"];
    const filteredEndpoints = endpoints.filter((endpoint) => {
        const matchesSearch = endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            endpoint.file.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesMethod = selectedMethod === "all" || endpoint.method === selectedMethod;
        return matchesSearch && matchesMethod;
    });
    const getMethodColor = (method) => {
        const colors = {
            GET: "bg-green-100 text-green-800 border-green-200",
            POST: "bg-blue-100 text-blue-800 border-blue-200",
            PUT: "bg-yellow-100 text-yellow-800 border-yellow-200",
            PATCH: "bg-orange-100 text-orange-800 border-orange-200",
            DELETE: "bg-red-100 text-red-800 border-red-200",
        };
        return colors[method] || "bg-gray-100 text-gray-800 border-gray-200";
    };
    const groupedEndpoints = filteredEndpoints.reduce((acc, endpoint) => {
        const key = endpoint.file;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(endpoint);
        return acc;
    }, {});
    return (<>
      <div className="space-y-6">
        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <react_icons_1.MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"/>
                <input type="text" placeholder="Search endpoints..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>

            <div className="flex gap-2">
              {methods.map((method) => (<button key={method} onClick={() => setSelectedMethod(method)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedMethod === method
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                  {method === "all" ? "All" : method}
                </button>))}
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Found {filteredEndpoints.length} endpoints
            {searchTerm && ` matching "${searchTerm}"`}
          </div>
        </div>

        {/* Endpoints List */}
        {Object.entries(groupedEndpoints).map(([file, fileEndpoints]) => (<div key={file} className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <react_icons_1.CodeIcon className="w-4 h-4 text-gray-500"/>
                <h3 className="font-medium text-gray-900">{file}</h3>
                <span className="text-sm text-gray-500">
                  ({fileEndpoints.length} endpoints)
                </span>
              </div>
            </div>

            <div className="divide-y">
              {fileEndpoints.map((endpoint, index) => (<div key={`${endpoint.method}-${endpoint.path}-${index}`} className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSelectedEndpoint(endpoint)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-md border ${getMethodColor(endpoint.method)}`}>
                        {endpoint.method}
                      </span>

                      <code className="text-sm font-mono text-gray-900">
                        {endpoint.path}
                      </code>

                      {endpoint.authentication && (<div className="flex items-center gap-1 text-xs text-gray-600">
                          <react_icons_1.LockClosedIcon className="w-3 h-3"/>
                          <span>Protected</span>
                        </div>)}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {endpoint.middleware &&
                    endpoint.middleware.length > 0 && (<span>{endpoint.middleware.length} middleware</span>)}
                      {endpoint.line && <span>Line {endpoint.line}</span>}
                    </div>
                  </div>

                  {endpoint.description && (<p className="mt-2 text-sm text-gray-600">
                      {endpoint.description}
                    </p>)}
                </div>))}
            </div>
          </div>))}

        {filteredEndpoints.length === 0 && (<div className="bg-white rounded-lg shadow-sm border p-12">
            <div className="text-center">
              <react_icons_1.CodeIcon className="w-12 h-12 text-gray-300 mx-auto mb-4"/>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No endpoints found
              </h3>
              <p className="text-gray-600">
                {searchTerm
                ? "Try adjusting your search criteria"
                : "No API endpoints were detected in your project"}
              </p>
            </div>
          </div>)}
      </div>

      {/* Endpoint Detail Modal */}
      {selectedEndpoint && (<EndpointDetailModal_1.EndpointDetailModal endpoint={selectedEndpoint} onClose={() => setSelectedEndpoint(null)}/>)}
    </>);
}
//# sourceMappingURL=ApiEndpointsList.js.map