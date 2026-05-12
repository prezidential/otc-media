import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await supabaseUser();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
