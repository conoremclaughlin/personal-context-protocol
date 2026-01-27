'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, RefreshCw } from 'lucide-react';

interface TrustedUser {
  id: string;
  platform: string;
  platformUserId: string;
  trustLevel: 'owner' | 'admin' | 'member';
  addedAt: string;
}

export default function TrustedUsersPage() {
  const [users, setUsers] = useState<TrustedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({
    platform: 'whatsapp',
    platformUserId: '',
    trustLevel: 'member',
  });

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/trusted-users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/trusted-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add user');
      }
      await fetchUsers();
      setShowAddForm(false);
      setNewUser({ platform: 'whatsapp', platformUserId: '', trustLevel: 'member' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to remove this trusted user?')) return;

    try {
      const response = await fetch(`/api/admin/trusted-users/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete user');
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const getTrustLevelBadge = (level: string) => {
    switch (level) {
      case 'owner':
        return <Badge variant="default">Owner</Badge>;
      case 'admin':
        return <Badge variant="secondary">Admin</Badge>;
      default:
        return <Badge variant="outline">Member</Badge>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trusted Users</h1>
          <p className="mt-2 text-gray-600">
            Manage users who can interact with Myra in DMs and generate group codes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUsers} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddForm(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {showAddForm && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Add Trusted User</CardTitle>
            <CardDescription>
              Add a new user who can interact with Myra.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Platform</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={newUser.platform}
                    onChange={(e) =>
                      setNewUser({ ...newUser, platform: e.target.value })
                    }
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telegram">Telegram</option>
                    <option value="discord">Discord</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">User ID</label>
                  <Input
                    placeholder={
                      newUser.platform === 'whatsapp'
                        ? '+14155551234'
                        : newUser.platform === 'telegram'
                        ? '123456789'
                        : 'discord_user_id'
                    }
                    value={newUser.platformUserId}
                    onChange={(e) =>
                      setNewUser({ ...newUser, platformUserId: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Trust Level</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={newUser.trustLevel}
                    onChange={(e) =>
                      setNewUser({ ...newUser, trustLevel: e.target.value })
                    }
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">Add User</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Trusted Users</CardTitle>
          <CardDescription>
            {users.length} user{users.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-gray-500">No trusted users configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Platform</th>
                    <th className="pb-3 font-medium">User ID</th>
                    <th className="pb-3 font-medium">Trust Level</th>
                    <th className="pb-3 font-medium">Added</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b">
                      <td className="py-3">
                        <Badge variant="outline">{user.platform}</Badge>
                      </td>
                      <td className="py-3 font-mono text-sm">
                        {user.platformUserId}
                      </td>
                      <td className="py-3">{getTrustLevelBadge(user.trustLevel)}</td>
                      <td className="py-3 text-sm text-gray-500">
                        {new Date(user.addedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {user.trustLevel !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
