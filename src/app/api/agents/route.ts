import { NextResponse } from "next/server";
import { listAgentMetadata } from "@/lib/agents/registry";

export async function GET() {
  return NextResponse.json({ agents: listAgentMetadata() });
}
