import { NextResponse } from "next/server";
import { isBeehiivEnabled } from "@/lib/publish/beehiiv";

export async function GET() {
  return NextResponse.json({
    beehiiv: isBeehiivEnabled(),
    export_html: true,
  });
}
