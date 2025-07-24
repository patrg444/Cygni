"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BuildsPage;
const react_1 = require("react");
const sdk_1 = require("@cygni/sdk");
// Simple status badge component
function StatusBadge({ status }) {
    const colors = {
        pending: "bg-gray-100 text-gray-800",
        in_progress: "bg-blue-100 text-blue-800",
        completed: "bg-green-100 text-green-800",
        failed: "bg-red-100 text-red-800",
    };
    return (<span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status}
    </span>);
}
// Component to monitor a single deployment
function DeploymentMonitor({ deploymentId }) {
    const { deployment, isDeploying, isCompleted, isFailed } = (0, sdk_1.useDeploymentMonitor)(deploymentId);
    if (!deployment)
        return null;
    return (<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-blue-900">Active Deployment</h3>
        <StatusBadge status={deployment.status || 'unknown'}/>
      </div>

      {deployment.services && (<div className="space-y-2">
          <p className="text-sm text-blue-700">Services:</p>
          {deployment.services.map((service) => (<div key={service.name} className="ml-4 text-sm">
              <span className="font-medium">{service.name}</span>
              {" - "}
              <StatusBadge status={service.status || 'unknown'}/>
              {service.url && (<a href={service.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">
                  View →
                </a>)}
            </div>))}
        </div>)}

      {isDeploying && (<div className="mt-2 text-sm text-blue-600">
          <span className="animate-pulse">⚡ Deployment in progress...</span>
        </div>)}
    </div>);
}
function BuildsPage() {
    const [projectId, setProjectId] = (0, react_1.useState)("test-project");
    const [activeDeploymentId, setActiveDeploymentId] = (0, react_1.useState)(null);
    // Fetch deployments using SDK hook
    const { data: deploymentData, isLoading, error, refetch, } = (0, sdk_1.useProjectDeployments)(projectId, {
        limit: 20,
    });
    // Create deployment mutation
    const createDeployment = (0, sdk_1.useCreateDeployment)();
    // Handle new deployment
    const handleCreateDeployment = async () => {
        const request = {
            cloudexpressConfig: {
                version: "1.0",
                services: [
                    {
                        name: "backend",
                        type: "backend",
                        path: "./backend",
                    },
                    {
                        name: "frontend",
                        type: "frontend",
                        path: "./frontend",
                    },
                ],
            },
            environment: "production",
            provider: "cloudexpress",
        };
        try {
            const result = await createDeployment.mutateAsync(request);
            console.log("Deployment created:", result);
            setActiveDeploymentId(result.deploymentId || null);
            // Refetch deployments list
            refetch();
        }
        catch (error) {
            console.error("Deployment failed:", error);
        }
    };
    return (<div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Builds & Deployments</h1>
        <p className="text-gray-600">
          Manage your application builds and deployments using the Cygni SDK
        </p>
      </div>

      {/* Active deployment monitor */}
      {activeDeploymentId && (<DeploymentMonitor deploymentId={activeDeploymentId}/>)}

      {/* Action buttons */}
      <div className="mb-6">
        <button onClick={handleCreateDeployment} disabled={createDeployment.isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          {createDeployment.isPending ? (<>
              <span className="animate-spin">⚡</span>
              Creating Deployment...
            </>) : (<>
              <span>🚀</span>
              Create New Deployment
            </>)}
        </button>
      </div>

      {/* Deployments table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Deployment History</h2>
        </div>

        {isLoading ? (<div className="p-6 text-center text-gray-500">
            Loading deployments...
          </div>) : error ? (<div className="p-6 text-center text-red-500">
            Error loading deployments: {error.message}
          </div>) : !deploymentData?.deployments ||
            deploymentData.deployments.length === 0 ? (<div className="p-6 text-center text-gray-500">
            No deployments yet. Click &quot;Create New Deployment&quot; to get
            started.
          </div>) : (<div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Environment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deploymentData.deployments.map((deployment) => (<tr key={deployment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {deployment.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={deployment.status || 'unknown'}/>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {deployment.environment}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {deployment.version}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {deployment.createdAt ? new Date(deployment.createdAt).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {deployment.url && (<a href={deployment.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-900">
                          View →
                        </a>)}
                      {deployment.status === "completed" ||
                    deployment.status === "in_progress" ? (<button onClick={() => setActiveDeploymentId(deployment.id || null)} className="ml-3 text-purple-600 hover:text-purple-900">
                          Monitor
                        </button>) : null}
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
      </div>

      {/* SDK Information */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold mb-2">🔧 Using @cygni/sdk</h3>
        <p className="text-sm text-gray-600 mb-2">
          This page demonstrates the Cygni SDK integration with the following
          hooks:
        </p>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            •{" "}
            <code className="bg-gray-200 px-1 rounded">
              useProjectDeployments
            </code>{" "}
            - Fetch deployment history
          </li>
          <li>
            •{" "}
            <code className="bg-gray-200 px-1 rounded">
              useCreateDeployment
            </code>{" "}
            - Create new deployments
          </li>
          <li>
            •{" "}
            <code className="bg-gray-200 px-1 rounded">
              useDeploymentMonitor
            </code>{" "}
            - Monitor deployment status in real-time
          </li>
        </ul>
      </div>
    </div>);
}
//# sourceMappingURL=page.js.map