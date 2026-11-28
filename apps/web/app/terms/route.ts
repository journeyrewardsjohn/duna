/** Short address: /terms is a permanent redirect to the legal center's document. */
export function GET() {
  return new Response(null, {
    status: 308,
    headers: { Location: "/legal/terms" },
  });
}
