"use client";

import { useAuth } from "../contexts/AuthContext";
import { useState } from "react";

export function UserProfile() {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100"
        aria-label="User menu"
      >
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
          {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
        </div>
        <span className="text-sm font-medium">{user.name || user.email}</span>
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border p-4">
          <div className="mb-4">
            <p className="text-sm font-medium">{user.name || "User"}</p>
            <p className="text-xs text-gray-600">{user.email}</p>
          </div>

          {user.organizations && user.organizations.length > 0 && (
            <div className="mb-4 pb-4 border-b">
              <p className="text-xs text-gray-600 mb-2">Organizations</p>
              {user.organizations.map((org) => (
                <div key={org.id} className="text-sm py-1">
                  <span className="font-medium">{org.name}</span>
                  <span className="text-gray-600 ml-2">({org.role})</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={async () => {
              await logout();
              setIsDropdownOpen(false);
            }}
            className="w-full text-left text-sm text-red-600 hover:text-red-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
