import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runOutreachCampaign, OUTREACH_SEGMENTS, type OutreachSegment } from "@/lib/outreach-campaign";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const staff = await requireRoleApi("admin", "superadmin");
  if (staff instanceof NextResponse) return staff;

  let body: {
    segment?: string;
    dryRun?: boolean;
    limit?: number;
    cooldownDays?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const segment = (body.segment || "all") as OutreachSegment;
  if (!OUTREACH_SEGMENTS.includes(segment)) {
    return NextResponse.json({ error: "invalid_segment", valid: OUTREACH_SEGMENTS }, { status: 400 });
  }

  const dryRun = body.dryRun !== false;
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
  const cooldownDays = Math.min(Math.max(body.cooldownDays ?? 7, 0), 90);

  try {
    const stats = await runOutreachCampaign({
      segment,
      limit,
      cooldownDays,
      apply: !dryRun,
      staffId: staff.id,
    });

    await logAudit({
      staffId: staff.id,
      action: dryRun ? "outreach_email_preview" : "outreach_email_batch",
      entityType: "system",
      details: {
        segment,
        limit,
        cooldownDays,
        queued: stats.queued,
        sent: stats.sent,
        failed: stats.failed,
      },
    });

    return NextResponse.json({ ok: true, dryRun, stats });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "campaign_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}