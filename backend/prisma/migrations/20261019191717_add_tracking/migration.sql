-- CreateTable
CREATE TABLE "TrackedSites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dailyLimitMin" INTEGER,

    CONSTRAINT "TrackedSites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "scrollPx" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedSites_userId_domain_key" ON "TrackedSites"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUsage_userId_domain_date_key" ON "DailyUsage"("userId", "domain", "date");

-- AddForeignKey
ALTER TABLE "TrackedSites" ADD CONSTRAINT "TrackedSites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUsage" ADD CONSTRAINT "DailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
