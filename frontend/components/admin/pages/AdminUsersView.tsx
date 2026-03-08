"use client";

import { Eye, RefreshCw, ShieldBan, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ToastProvider";
import apiClient from "@/lib/api-client";

type UserRow = {
  id: string;
  email: string;
  fullName?: string | null;
  isBanned: boolean;
  createdAt: string;
  stats: {
    applications: number;
    aiCalls: number;
  };
};

export function AdminUsersView() {
  const { pushToast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<Record<string, unknown> | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ users: UserRow[] }>("/admin/users?limit=200&page=1");
      setUsers(response.data.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return users;
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(normalized) ||
        (user.fullName ?? "").toLowerCase().includes(normalized)
    );
  }, [query, users]);

  const viewProfile = async (id: string) => {
    try {
      const response = await apiClient.get(`/admin/users/${id}`);
      setSelectedUser(response.data as Record<string, unknown>);
    } catch {
      pushToast("Failed to load user detail", "error");
    }
  };

  const toggleBan = async (id: string, isBanned: boolean) => {
    try {
      await apiClient.put(`/admin/users/${id}/ban`, { isBanned: !isBanned });
      pushToast(isBanned ? "User unbanned" : "User banned", "success");
      await loadUsers();
    } catch {
      pushToast("Failed to update user", "error");
    }
  };

  const resetUsage = async (id: string) => {
    try {
      await apiClient.post(`/admin/users/${id}/reset-ai-usage`, {});
      pushToast("AI usage reset", "success");
      await loadUsers();
    } catch {
      pushToast("Failed to reset AI usage", "error");
    }
  };

  const deleteUser = async (id: string) => {
    if (!window.confirm("Delete this user and all associated data?")) return;

    try {
      await apiClient.delete(`/admin/users/${id}`);
      pushToast("User deleted", "success");
      await loadUsers();
    } catch {
      pushToast("Failed to delete user", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search by name or email" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" />
        <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800">
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Signup</th>
              <th className="px-3 py-3">Applications</th>
              <th className="px-3 py-3">AI Usage</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                <td className="px-3 py-3">
                  <p className="font-medium">{user.fullName || "Unnamed User"}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="px-3 py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-3">{user.stats.applications}</td>
                <td className="px-3 py-3">{user.stats.aiCalls}</td>
                <td className="px-3 py-3">{user.isBanned ? "Banned" : "Active"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void viewProfile(user.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void toggleBan(user.id, user.isBanned)}>
                      {user.isBanned ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : <ShieldBan className="mr-1 h-3.5 w-3.5" />}
                      {user.isBanned ? "Unban" : "Ban"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void resetUsage(user.id)}>
                      Reset AI
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void deleteUser(user.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)} title="User Detail">
        {selectedUser ? <pre className="max-h-[70vh] overflow-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-800">{JSON.stringify(selectedUser, null, 2)}</pre> : null}
      </Dialog>
    </div>
  );
}
