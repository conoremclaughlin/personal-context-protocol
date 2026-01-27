import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Check for error from Supabase (e.g., expired link)
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    const errorParam = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(`${origin}/login?error=${errorParam}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Pass specific error message
    const errorMessage = encodeURIComponent(exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=${errorMessage}`);
  }

  // No code provided
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('No authentication code provided')}`);
}
