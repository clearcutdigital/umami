-- CreateTable
CREATE TABLE "website_monthly_report_recipient" (
    "website_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "send" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "website_monthly_report_recipient_pkey" PRIMARY KEY ("website_id", "email")
);

-- CreateIndex
CREATE INDEX "website_monthly_report_recipient_send_idx" ON "website_monthly_report_recipient"("send");
