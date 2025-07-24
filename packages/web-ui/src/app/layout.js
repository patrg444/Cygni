"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const providers_simple_1 = require("./providers-simple");
const inter = (0, google_1.Inter)({ subsets: ["latin"] });
exports.metadata = {
    title: "CloudExpress Dashboard",
    description: "Manage your CloudExpress deployments",
};
function RootLayout({ children, }) {
    return (<html lang="en">
      <body className={inter.className}>
        <providers_simple_1.Providers>
          <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm">
              <div className="container mx-auto px-4">
                <div className="flex justify-between items-center h-16">
                  <div className="flex items-center">
                    <h1 className="text-xl font-bold text-primary-600" style={{ fontSize: "1.25rem" }}>
                      CloudExpress
                    </h1>
                    <div className="ml-10 flex items-baseline space-x-4">
                      <a href="/console" className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                        Console
                      </a>
                      <a href="/deployments" className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                        Deployments
                      </a>
                      <a href="/projects" className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                        Projects
                      </a>
                      <a href="/settings" className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                        Settings
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <button className="text-gray-700 hover:text-primary-600">
                      Profile
                    </button>
                  </div>
                </div>
              </div>
            </nav>
            <main>{children}</main>
          </div>
        </providers_simple_1.Providers>
      </body>
    </html>);
}
//# sourceMappingURL=layout.js.map