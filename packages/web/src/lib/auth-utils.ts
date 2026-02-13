// Map common Supabase auth error messages to user-friendly text
export function getErrorMessage(error: string): string {
  const errorMap: Record<string, string> = {
    auth: 'Authentication failed. Please try again.',
    'code challenge does not match previously saved code verifier':
      'Your magic link expired or was opened in a different browser. Please request a new one using the same browser.',
    'Email link is invalid or has expired':
      'This magic link has expired. Please request a new one.',
    'No authentication code provided': 'Invalid login link. Please request a new magic link.',
    'Invalid login credentials': 'Invalid email or password. Please try again.',
    'Email not confirmed': 'Please confirm your email address before signing in.',
    'rate limit': 'Too many requests. Please try signing in with password instead.',
    'User already registered': 'An account with this email already exists. Try signing in instead.',
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  return error;
}
