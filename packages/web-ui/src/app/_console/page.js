"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ConsolePage;
const react_query_1 = require("@tanstack/react-query");
const react_1 = require("react");
const react_icons_1 = require("@radix-ui/react-icons");
const ProjectOverview_1 = require("@/components/console/ProjectOverview");
const ApiEndpointsList_1 = require("@/components/console/ApiEndpointsList");
const RuntimeConfig_1 = require("@/components/console/RuntimeConfig");
const DeploymentConfig_1 = require("@/components/console/DeploymentConfig");
function ConsolePage() {
    const [activeTab, setActiveTab] = (0, react_1.useState)("overview");
    // Fetch project analysis data
    const { data: projectData, isLoading, error, } = (0, react_query_1.useQuery)({
        queryKey: ["project-analysis"],
        queryFn: async () => {
            // In a real app, this would call the API
            // For now, we'll simulate calling the CLI analyze command
            const response = await fetch("/api/project/analyze");
            if (!response.ok)
                throw new Error("Failed to analyze project");
            return response.json();
        },
    });
    const tabs = [
        {
            id: "overview",
            label: "Overview",
            icon: <react_icons_1.CubeIcon className="w-4 h-4"/>,
        },
        {
            id: "endpoints",
            label: "API Endpoints",
            icon: <react_icons_1.CodeIcon className="w-4 h-4"/>,
        },
        {
            id: "runtime",
            label: "Runtime Config",
            icon: <react_icons_1.FileTextIcon className="w-4 h-4"/>,
        },
        {
            id: "deployment",
            label: "Deployment",
            icon: <react_icons_1.RocketIcon className="w-4 h-4"/>,
        },
    ];
    if (error) {
        return (<div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              Failed to analyze project
            </h2>
            <p className="text-red-600">{error.message}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
              Retry
            </button>
          </div>
        </div>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                CloudExpress Console
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Analyze, configure, and deploy your application
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                <react_icons_1.ActivityLogIcon className="w-4 h-4"/>
                View Logs
              </button>
              <button className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">
                <react_icons_1.RocketIcon className="w-4 h-4"/>
                Deploy Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 text-sm font-medium transition-colors
                  ${activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
                `}>
                {tab.icon}
                {tab.label}
              </button>))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {isLoading ? (<div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="text-gray-600">Analyzing project...</span>
              </div>
            </div>
          </div>) : (<>
            {activeTab === "overview" && <ProjectOverview_1.ProjectOverview data={projectData}/>}
            {activeTab === "endpoints" && (<ApiEndpointsList_1.ApiEndpointsList endpoints={projectData?.endpoints || []}/>)}
            {activeTab === "runtime" && (<RuntimeConfig_1.RuntimeConfig initialConfig={projectData?.runtimeConfig} framework={projectData?.framework}/>)}
            {activeTab === "deployment" && (<DeploymentConfig_1.DeploymentConfig framework={projectData?.framework} runtimeConfig={projectData?.runtimeConfig}/>)}
          </>)}
      </div>
    </div>);
}
//# sourceMappingURL=page.js.map