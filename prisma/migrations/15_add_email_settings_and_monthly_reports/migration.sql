-- CreateTable
CREATE TABLE "email_settings" (
    "id" VARCHAR(50) NOT NULL,
    "api_key" VARCHAR(255) NOT NULL,
    "from_address" VARCHAR(255) NOT NULL,
    "reply_to" VARCHAR(255),
    "tracking_loads" BOOLEAN NOT NULL DEFAULT true,
    "tracking_clicks" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_monthly_report" (
    "website_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT NOT NULL DEFAULT '',
    "subject" VARCHAR(255),
    "reply_to" VARCHAR(255),
    "last_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "website_monthly_report_pkey" PRIMARY KEY ("website_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_monthly_report_website_id_key" ON "website_monthly_report"("website_id");
