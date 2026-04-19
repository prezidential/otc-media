export type ApprovalPayload = {
  approvalId: string;
  entityType: "newsletter_draft" | "linkedin_draft" | "lead_batch";
  entityId: string;
  headline: string;
  previewLines: string[];
  channel: string;
  contentLane?: string;
};

export type ApprovalResponse = {
  approvalId: string;
  decision: "approved" | "rejected";
  respondedAt: string;
};

export type StatusMessage = {
  level: "info" | "success" | "warning" | "error";
  title: string;
  body?: string;
  url?: string;
};

export interface NotificationProvider {
  readonly id: string;

  sendApprovalRequest(payload: ApprovalPayload): Promise<{ messageRef: string }>;

  sendStatusUpdate(message: StatusMessage): Promise<void>;

  handleInbound?(body: unknown, headers: Record<string, string>): Promise<ApprovalResponse | null>;
}
