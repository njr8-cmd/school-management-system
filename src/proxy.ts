import { auth } from "@/auth";
import { isAppRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

export default auth((request) => {
  if (
    !request.auth?.user?.id ||
    !isAppRole(request.auth.user.role)
  ) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/((?!auth).*)"],
};
