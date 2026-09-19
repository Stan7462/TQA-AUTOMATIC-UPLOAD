export async function POST() {
  return Response.json({ error: 'Sign in with your Tech ID and PIN at /login.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
