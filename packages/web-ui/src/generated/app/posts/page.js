"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PostsPage;
const react_1 = require("react");
const PostsForm_1 = require("../../components/posts/PostsForm");
const sdk_1 = require("@cygni/sdk");
function PostsPage() {
    const [showForm, setShowForm] = (0, react_1.useState)(false);
    const [editingId, setEditingId] = (0, react_1.useState)(null);
    const { data, isLoading, error, refetch } = (0, sdk_1.usePostsList)();
    const deleteMutation = (0, sdk_1.useDeletePost)();
    const handleEdit = (id) => {
        setEditingId(id);
        setShowForm(true);
    };
    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this item?")) {
            try {
                await deleteMutation.mutateAsync(id);
                refetch();
            }
            catch (error) {
                console.error("Delete failed:", error);
            }
        }
    };
    const handleFormClose = () => {
        setShowForm(false);
        setEditingId(null);
        refetch();
    };
    if (isLoading)
        return <div className="p-8">Loading...</div>;
    if (error)
        return <div className="p-8 text-red-500">Error: {error.message}</div>;
    return (<div className="container mx-auto py-8 px-4">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Posts</h1>
          <p className="text-gray-600">Manage your posts</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Create New
        </button>
      </div>

      {showForm && <PostsForm_1.PostsForm id={editingId} onClose={handleFormClose}/>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.map((item) => (<tr key={item.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.name || item.title || "N/A"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(item.createdAt || item.created_at || Date.now()).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <button onClick={() => handleEdit(item.id)} className="text-blue-600 hover:text-blue-900">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900">
                    Delete
                  </button>
                </td>
              </tr>))}
          </tbody>
        </table>
        {(!data || data.length === 0) && (<div className="p-6 text-center text-gray-500">
            No posts found. Create one to get started.
          </div>)}
      </div>
    </div>);
}
//# sourceMappingURL=page.js.map