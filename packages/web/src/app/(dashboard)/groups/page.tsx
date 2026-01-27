'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, XCircle } from 'lucide-react';

interface AuthorizedGroup {
  id: string;
  platform: string;
  platformGroupId: string;
  groupName: string | null;
  authorizationMethod: 'trusted_user' | 'challenge_code';
  authorizedAt: string;
  status: 'active' | 'revoked';
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<AuthorizedGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/groups');
      if (!response.ok) throw new Error('Failed to fetch groups');
      const data = await response.json();
      setGroups(data.groups);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeGroup = async (id: string, platformGroupId: string) => {
    if (
      !confirm(
        'Are you sure you want to revoke this group? Myra will leave the group and stop responding.'
      )
    )
      return;

    try {
      const response = await fetch(`/api/admin/groups/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformGroupId }),
      });
      if (!response.ok) throw new Error('Failed to revoke group');
      await fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke group');
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Authorized Groups</h1>
          <p className="mt-2 text-gray-600">
            View and manage groups where Myra is active.
          </p>
        </div>
        <Button onClick={fetchGroups} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Groups</CardTitle>
          <CardDescription>
            {groups.filter((g) => g.status === 'active').length} active group
            {groups.filter((g) => g.status === 'active').length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No authorized groups yet.</p>
              <p className="text-sm text-gray-400 mt-2">
                Generate a challenge code and use it to authorize a group.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Platform</th>
                    <th className="pb-3 font-medium">Group</th>
                    <th className="pb-3 font-medium">Method</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Authorized</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id} className="border-b">
                      <td className="py-3">
                        <Badge variant="outline">{group.platform}</Badge>
                      </td>
                      <td className="py-3">
                        <div>
                          <span className="font-medium">
                            {group.groupName || 'Unknown Group'}
                          </span>
                          <br />
                          <span className="text-xs text-gray-500 font-mono">
                            {group.platformGroupId.substring(0, 20)}...
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="secondary">
                          {group.authorizationMethod === 'challenge_code'
                            ? 'Code'
                            : 'Direct'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={
                            group.status === 'active' ? 'success' : 'destructive'
                          }
                        >
                          {group.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-gray-500">
                        {new Date(group.authorizedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        {group.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRevokeGroup(group.id, group.platformGroupId)
                            }
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
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
