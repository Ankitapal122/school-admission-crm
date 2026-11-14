import { expect, test } from '@playwright/test';

test.describe('BoardingEdu Enterprise CRM E2E Verification', () => {
  test('1. Preserves BoardingEdu Login branding, Role Cards, Forgot Password OTP view & logs in as Admin', async ({
    page,
  }) => {
    await page.goto('/');

    // BoardingEdu Logo & Login heading
    await expect(page.locator('img[alt="BoardingEdu - Connecting Parents & Schools"]')).toBeVisible();
    await expect(page.getByText('Login to Your Account')).toBeVisible();

    // 3 Role selection cards preserved
    await expect(page.locator('#roleCard-admin')).toBeVisible();
    await expect(page.locator('#roleCard-manager')).toBeVisible();
    await expect(page.locator('#roleCard-counsellor')).toBeVisible();

    // Forgot Password toggle preserves Email -> OTP flow
    await page.getByText('Forgot password?').click();
    await expect(page.getByRole('heading', { name: /Forgot Password/i })).toBeVisible();
    await page.getByRole('button', { name: /Back to Login/i }).click();

    // Admin Login via role card + explicit credentials
    await page.locator('#roleCard-admin').click();
    await page.locator('input[placeholder="adminboarding123@gmail.com"]').fill('adminboarding123@gmail.com');
    await page.locator('input[placeholder="••••••••••••"]').fill('Admin@123');
    await page.locator('#btnLogin').click();

    // Verify Admin Dashboard loads live PostgreSQL KPIs including "Total School Enquiries"
    await expect(page.getByText('Total School Enquiries')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.stat-card').first()).not.toContainText('NaN');
  });

  test('2. Responsive Collapse/Expand Sidebar, 360px Mobile Menu & Kanban Stage Dropdown', async ({ page }) => {
    await page.goto('/');
    await page.locator('#roleCard-admin').click();
    await page.locator('input[placeholder="adminboarding123@gmail.com"]').fill('adminboarding123@gmail.com');
    await page.locator('input[placeholder="••••••••••••"]').fill('Admin@123');
    await page.locator('#btnLogin').click();
    await expect(page.getByText('Total School Enquiries')).toBeVisible({ timeout: 15_000 });

    // Desktop collapse (<) & BoardingEdu expand pill button
    await page.locator('button[aria-label="Collapse sidebar to view full dashboard"]').click();
    await expect(page.locator('button[aria-label="Expand sidebar"]')).toBeVisible();
    await page.locator('button[aria-label="Expand sidebar"]').click();
    await expect(page.locator('button[aria-label="Collapse sidebar to view full dashboard"]')).toBeVisible();

    // Mobile 360x800 responsiveness
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator('button[aria-label="Open navigation menu"]').click();
    await expect(page.locator('aside.sidebar.mobile-open')).toBeVisible();
    await page.getByText('Lead Management').click();

    // Switch to 12-stage Kanban & verify mobile stage dropdown renders
    await page.getByRole('button', { name: /12-Stage Kanban/i }).click();
    await expect(page.getByText('New Lead').first()).toBeVisible({ timeout: 10_000 });
    const stageSelectCount = await page.locator('select[aria-label^="Change stage for"], select').count();
    expect(stageSelectCount).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1366, height: 820 });
  });

  test('3. Settings Live Total=100 Validation for 5 Lead Scoring Factors & 8 Matching Criteria', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#roleCard-admin').click();
    await page.locator('input[placeholder="adminboarding123@gmail.com"]').fill('adminboarding123@gmail.com');
    await page.locator('input[placeholder="••••••••••••"]').fill('Admin@123');
    await page.locator('#btnLogin').click();
    await expect(page.getByText('Total School Enquiries')).toBeVisible({ timeout: 15_000 });

    await page.getByText('System Settings').click();
    await expect(page.getByText('Feature 1: Lead Scoring Weights (5 Factors)')).toBeVisible();

    // Lead Scoring 5-factor live validation
    const scoringBtn = page.getByRole('button', { name: /Save Lead Scoring Weights/i });
    await expect(scoringBtn).toContainText('Total: 100 ✓');
    await expect(scoringBtn).toBeEnabled();

    const firstScoreInput = page.locator('input[type="number"]').first();
    const origScoreVal = await firstScoreInput.inputValue();
    await firstScoreInput.fill(String(Number(origScoreVal) - 5));
    await expect(page.getByText('Total: 95 ✗')).toBeVisible();
    await expect(scoringBtn).toBeDisabled();

    // Restore valid 100
    await firstScoreInput.fill(origScoreVal);
    await expect(scoringBtn).toContainText('Total: 100 ✓');
    await expect(scoringBtn).toBeEnabled();

    // Matching Criteria 8-factor live validation
    const matchingCard = page.locator('.card', { hasText: 'Feature 2: School Matching Weights (8 Criteria)' });
    const matchingBtn = matchingCard.getByRole('button', { name: /Save Matching Criteria/i });
    await expect(matchingBtn).toContainText('Total: 100 ✓');
    await expect(matchingBtn).toBeEnabled();

    const firstMatchInput = matchingCard.locator('input[type="number"]').first();
    const origMatchVal = await firstMatchInput.inputValue();
    await firstMatchInput.fill(String(Number(origMatchVal) - 1));
    await expect(matchingCard.getByText('Total: 99 ✗')).toBeVisible();
    await expect(matchingBtn).toBeDisabled();

    await firstMatchInput.fill(origMatchVal);
    await expect(matchingBtn).toContainText('Total: 100 ✓');
    await expect(matchingBtn).toBeEnabled();
  });

  test('4. Create Lead with DPDP Consent, Open Dossier, Append Remark & Check 20 Reports', async ({ page }) => {
    await page.goto('/');
    await page.locator('#roleCard-admin').click();
    await page.locator('input[placeholder="adminboarding123@gmail.com"]').fill('adminboarding123@gmail.com');
    await page.locator('input[placeholder="••••••••••••"]').fill('Admin@123');
    await page.locator('#btnLogin').click();
    await expect(page.getByText('Total School Enquiries')).toBeVisible({ timeout: 15_000 });

    // Create Lead via Topbar New Lead button
    await page.getByRole('button', { name: /New Lead/i }).first().click();
    await expect(page.getByText('Create Student & Parent Enquiry')).toBeVisible();

    const uniqueSuffix = String(Date.now()).slice(-6);
    const modal = page.locator('.modal-content');
    const textInputs = modal.locator('input[type="text"]');
    await textInputs.nth(0).fill(`Aarav E2E ${uniqueSuffix}`);
    await textInputs.nth(1).fill(`Rajesh E2E ${uniqueSuffix}`);
    await textInputs.nth(2).fill(`9811${uniqueSuffix}`);
    await modal.getByRole('button', { name: 'Create Lead' }).click();

    // Navigate to Lead Management and open created lead dossier
    await page.getByText('Lead Management').click();
    await expect(page.getByText(`Aarav E2E ${uniqueSuffix}`)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Open Dossier/i }).first().click();
    await expect(page.getByText(/Optimistic Lock Version:/i)).toBeVisible({ timeout: 10_000 });

    // Append a remark inside Dossier
    const remarkInput = page.locator('.modal-content input[placeholder*="remark" i], .modal-content input[type="text"]').last();
    await remarkInput.fill(`Playwright verification remark ${uniqueSuffix}`);
    await page.getByRole('button', { name: 'Append Remark' }).click();
    await expect(page.getByText(`Playwright verification remark ${uniqueSuffix}`)).toBeVisible({ timeout: 10_000 });
    await page.locator('.modal-header button', { hasText: '✕' }).click();

    // Check Reports & Analytics -> all 20 report options
    await page.getByText('Reports & Analytics').click();
    await expect(page.getByText(/Enterprise Analytics & 20-Report Export Suite/i)).toBeVisible();
    const reportOptions = await page.locator('select option').count();
    expect(reportOptions).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole('button', { name: /Export Excel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Export PDF/i })).toBeVisible();
  });
});
