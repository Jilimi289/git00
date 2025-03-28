import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request) {
  const token = request.cookies.get('auth_token')?.value;
  const isLoggedIn = token ? verifyToken(token) : false;
  // Add some debugging
  console.log('Token:', token);
  console.log('Is logged in:', isLoggedIn);
  return NextResponse.json({ isLoggedIn });
}
