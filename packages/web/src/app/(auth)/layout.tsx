import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12 lg:px-12">
        <div className="w-full max-w-[440px]">{children}</div>
      </div>
    </div>
  );
}
