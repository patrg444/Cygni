"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostsDetail = PostsDetail;
const sdk_1 = require("@cygni/sdk");
function PostsDetail({ id }) {
    const { data, isLoading, error } = (0, sdk_1.useGetPost)(id);
    if (isLoading)
        return <div>Loading...</div>;
    if (error)
        return <div className="text-red-500">Error: {error.message}</div>;
    if (!data)
        return <div>Not found</div>;
    return (<div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Post Details</h3>

      <dl className="space-y-3">
        <div>
          <dt className="text-sm font-medium text-gray-500">ID</dt>
          <dd className="text-sm text-gray-900">{data.id}</dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-gray-500">Title</dt>
          <dd className="text-sm text-gray-900">{data.title || "N/A"}</dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-gray-500">Content</dt>
          <dd className="text-sm text-gray-900">{data.content || "N/A"}</dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-gray-500">Created</dt>
          <dd className="text-sm text-gray-900">
            {new Date(data.createdAt || Date.now()).toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>);
}
//# sourceMappingURL=PostsDetail.js.map