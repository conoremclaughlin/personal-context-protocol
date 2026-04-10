'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LogOut,
  Home,
  Bot,
  Bell,
  Link2,
  FileText,
  Puzzle,
  Plus,
  UserPlus,
  Building2,
  ChevronDown,
  Check,
  Settings,
  Activity,
  Route,
  MessageSquare,
  ListTodo,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useApiPost, useApiPostDynamic, useApiQuery, useQueryClient } from '@/lib/api/hooks';
import { getSelectedWorkspaceId, setSelectedWorkspaceId } from '@/lib/workspace-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const mainNav: NavGroup[] = [
  {
    items: [{ name: 'Dashboard', href: '/', icon: Home }],
  },
  {
    label: 'Team',
    items: [
      { name: 'Individuals', href: '/individuals', icon: Bot },
      { name: 'Tasks', href: '/tasks', icon: ListTodo },
      { name: 'Strategies', href: '/strategies', icon: Zap },
      { name: 'Documents', href: '/artifacts', icon: FileText },
      { name: 'Messaging', href: '/messaging', icon: MessageSquare },
      { name: 'Skills', href: '/skills', icon: Puzzle },
    ],
  },
  {
    label: 'Platform',
    items: [
      { name: 'Reminders', href: '/reminders', icon: Bell },
      { name: 'Connections', href: '/connected-accounts', icon: Link2 },
      { name: 'Routing', href: '/routing', icon: Route },
      { name: 'Sessions', href: '/sessions', icon: Activity },
    ],
  },
];
