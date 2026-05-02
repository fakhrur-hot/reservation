# Manual Testing Guide

This guide provides step-by-step instructions for manual testing of the setup wizard UI and related features.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 15+ running
- Redis 7+ running
- Both frontend applications built and running:
  - Sneat Dashboard: http://localhost:5173
  - Qitchen Portal: http://localhost:5174
- Backend API running: http://localhost:3001

## Setup

1. Start the backend:
```bash
npm run dev
```

2. In separate terminals, start the frontends:
```bash
cd client/sneat-dashboard
npm run dev
```

```bash
cd client/qitchen-portal
npm run dev
```

3. Reset the database to a fresh state:
```bash
# Delete all data from app_config to reset setup
psql postgresql://tablebook:tablebook@localhost/tablebook -c "DELETE FROM app_config WHERE key IN ('setup_completed', 'setup_progress');"
```

---

## Task 30: Manual Testing - Setup Wizard UI

### Test 30.1: All 8 Steps Render Correctly (Desktop)

**Steps:**
1. Open http://localhost:5173 in a desktop browser (1920x1080 or larger)
2. Verify you are redirected to `/setup`
3. Verify the setup wizard page loads with:
   - Progress bar at the top showing "Step 1 of 8"
   - Step 1 form with fields: Restaurant Name, Branch Code, Address, City, State, Postcode, Country, Phone, Website, Timezone, Currency
   - "Next" button at the bottom
   - No "Back" button (Step 1 has no back)

**Expected Result:** ✓ All fields render correctly with proper labels and input types

### Test 30.2: All 8 Steps Render Correctly (Mobile)

**Steps:**
1. Open http://localhost:5173 in a mobile browser or use DevTools to simulate 375px width
2. Repeat steps 2-3 from Test 30.1
3. Verify the layout is responsive:
   - Progress bar shows step icons instead of full labels on mobile
   - Form fields stack vertically
   - Buttons are full-width and touch-friendly (44px+ height)

**Expected Result:** ✓ Layout is responsive and usable on 375px viewport

### Test 30.3: Progress Bar Shows Correct Step Indicator

**Steps:**
1. Start at Step 1
2. Verify progress bar shows: `[✓] Step 1 [●] Step 2 [ ] Step 3 [ ] Step 4 [ ] Step 5 [ ] Step 6 [ ] Step 7 [ ] Step 8`
3. Fill in Step 1 and click "Next"
4. Verify progress bar updates to: `[✓] Step 1 [✓] Step 2 [●] Step 3 [ ] Step 4 [ ] Step 5 [ ] Step 6 [ ] Step 7 [ ] Step 8`
5. Continue through all steps, verifying the progress bar updates correctly

**Expected Result:** ✓ Progress bar accurately reflects current step and completed steps

### Test 30.4: Back Button Works on All Steps Except Step 1

**Steps:**
1. Complete Step 1 and advance to Step 2
2. Verify "Back" button is visible
3. Click "Back" and verify you return to Step 1 with data preserved
4. Click "Next" to return to Step 2
5. Repeat for Steps 3-8

**Expected Result:** ✓ Back button works on Steps 2-8, no back button on Step 1, data is preserved

### Test 30.5: Next Button Validates Before Advancing

**Steps:**
1. On Step 1, leave "Restaurant Name" empty
2. Click "Next"
3. Verify an inline error message appears: "Restaurant Name is required"
4. Verify the form does NOT advance to Step 2
5. Fill in "Restaurant Name" and click "Next"
6. Verify the form advances to Step 2

**Expected Result:** ✓ Validation prevents advancement, error messages display inline

### Test 30.6: Inline Error Messages Display for Validation Failures

**Steps:**
1. On Step 4 (Admin Account), enter a password with only 4 characters
2. Verify an inline error appears: "Password must be at least 8 characters"
3. On Step 4, enter mismatched passwords in "Password" and "Confirm Password"
4. Verify an inline error appears: "Passwords do not match"
5. On Step 2 (Operating Hours), mark all days as closed
6. Click "Next"
7. Verify an inline error appears: "At least one day must be open"

**Expected Result:** ✓ All validation errors display inline next to the relevant field

### Test 30.7: Auto-Save to localStorage Works

**Steps:**
1. Fill in Step 1 with:
   - Restaurant Name: "Test Restaurant"
   - Branch Code: "TEST01"
   - Address: "123 Test Street"
   - City: "Kuala Lumpur"
   - State: "Selangor"
   - Postcode: "50000"
   - Country: "Malaysia"
   - Phone: "+60123456789"
   - Timezone: "Asia/Kuala_Lumpur"
   - Currency: "MYR"
2. Open browser DevTools → Application → Local Storage
3. Verify `setup_wizard_progress` key exists with JSON containing all entered data
4. Refresh the page (F5)
5. Verify the form is restored to Step 1 with all data intact

**Expected Result:** ✓ Data is saved to localStorage and restored on page refresh

### Test 30.8: Edit Links on Step 8 Navigate Back with Data Preserved

**Steps:**
1. Complete all 8 steps of the wizard
2. On Step 8 (Review & Confirm), verify you see sections for each step with "Edit" links
3. Click "Edit" next to "Step 1: Restaurant Profile"
4. Verify you navigate back to Step 1 with all previously entered data intact
5. Make a change (e.g., change timezone to "Asia/Bangkok")
6. Click "Next" to return to Step 8
7. Verify the change is reflected in the Step 1 summary

**Expected Result:** ✓ Edit links navigate to correct step, data is preserved and changes are reflected

### Test 30.9: Final Submission Shows Success Screen

**Steps:**
1. Complete all 8 steps with valid data
2. On Step 8, click "Complete Setup"
3. Verify a loading indicator appears briefly
4. Verify the page transitions to a success screen with:
   - Message: "Setup Complete!"
   - "Go to Dashboard" button
5. Click "Go to Dashboard"
6. Verify you are redirected to `/tables` (the main dashboard)

**Expected Result:** ✓ Success screen displays and "Go to Dashboard" button navigates to `/tables`

### Test 30.10: Go to Dashboard Button Navigates to /tables

**Steps:**
1. Complete the setup wizard
2. On the success screen, click "Go to Dashboard"
3. Verify the URL changes to `http://localhost:5173/tables`
4. Verify the main dashboard page loads with the table management interface

**Expected Result:** ✓ Navigation to `/tables` works correctly

---

## Task 31: Manual Testing - Qitchen Portal Coming Soon

### Test 31.1: Before Setup Complete - All Routes Show Coming Soon

**Steps:**
1. Ensure setup is NOT complete (delete `setup_completed` from app_config)
2. Open http://localhost:5174 (Qitchen Portal)
3. Verify you see the "Coming Soon" page
4. Try navigating to different routes:
   - http://localhost:5174/book
   - http://localhost:5174/reservation
   - http://localhost:5174/feedback
5. Verify all routes show the "Coming Soon" page

**Expected Result:** ✓ All routes show "Coming Soon" page before setup is complete

### Test 31.2: After Setup Complete - Normal Booking Flow Displays

**Steps:**
1. Complete the setup wizard in Sneat Dashboard
2. Refresh http://localhost:5174 (Qitchen Portal)
3. Verify the "Coming Soon" page is no longer shown
4. Verify the normal booking flow displays (table selection grid or booking form)

**Expected Result:** ✓ Normal booking flow displays after setup is complete

### Test 31.3: No Redirect to /setup (Staff-Only)

**Steps:**
1. Ensure setup is NOT complete
2. Open http://localhost:5174 (Qitchen Portal)
3. Verify you see the "Coming Soon" page
4. Verify the URL remains `http://localhost:5174` (NOT redirected to `/setup`)
5. Verify there is no "Setup" link or button visible

**Expected Result:** ✓ No redirect to `/setup`, setup is staff-only in Sneat Dashboard

### Test 31.4: Mobile-Responsive Design Works Correctly

**Steps:**
1. Open http://localhost:5174 in a mobile browser or use DevTools to simulate 375px width
2. Verify the "Coming Soon" page is responsive:
   - Text is readable
   - No horizontal scrolling
   - Buttons/links are touch-friendly (44px+ height)
3. After setup, verify the booking flow is also responsive on mobile

**Expected Result:** ✓ Mobile-responsive design works correctly on 375px+ viewports

---

## Task 32: Manual Testing - SMTP Test Email

### Test 32.1: Send Test Email Button Disabled Until All Fields Filled

**Steps:**
1. Complete Steps 1-5 of the setup wizard
2. On Step 6 (Email Settings), verify the "Send test email" button is DISABLED (greyed out)
3. Fill in SMTP Host: "smtp.gmail.com"
4. Verify the button is still DISABLED
5. Fill in SMTP Port: "587"
6. Verify the button is still DISABLED
7. Fill in SMTP Username: "your-email@gmail.com"
8. Verify the button is still DISABLED
9. Fill in SMTP Password: "your-app-password"
10. Verify the button is still DISABLED
11. Fill in From Name: "Test Restaurant"
12. Verify the button is still DISABLED
13. Fill in From Email: "noreply@restaurant.com"
14. Verify the button is now ENABLED (clickable)

**Expected Result:** ✓ Button is disabled until all required SMTP fields are filled

### Test 32.2: Clicking Button Calls POST /setup/smtp/test

**Steps:**
1. Fill in all SMTP fields with valid Gmail credentials
2. Open browser DevTools → Network tab
3. Click "Send test email"
4. Verify a POST request is made to `/setup/smtp/test`
5. Verify the request body contains all SMTP fields

**Expected Result:** ✓ POST request is made to correct endpoint with all fields

### Test 32.3: Success - Green Banner Displays

**Steps:**
1. Fill in SMTP fields with valid Gmail credentials
2. Click "Send test email"
3. Verify a green success banner appears with message: "Test email sent successfully!"
4. Verify the operator can proceed to the next step

**Expected Result:** ✓ Green success banner displays on successful test

### Test 32.4: Failure - Red Error Message Displays

**Steps:**
1. Fill in SMTP fields with INVALID credentials (e.g., wrong password)
2. Click "Send test email"
3. Verify a red error message appears with the SMTP error details
4. Verify the operator can still proceed to the next step (not blocked)
5. Verify the operator can retry by clicking "Send test email" again

**Expected Result:** ✓ Red error message displays, operator can skip or retry

### Test 32.5: Credentials Never Stored During Test

**Steps:**
1. Fill in SMTP fields with test credentials
2. Click "Send test email"
3. Wait for the test to complete
4. Open browser DevTools → Application → Local Storage
5. Verify `setup_wizard_progress` does NOT contain SMTP credentials
6. Open a database query tool and check app_config table:
   ```sql
   SELECT * FROM app_config WHERE key LIKE 'smtp%';
   ```
7. Verify NO SMTP credentials are stored in the database

**Expected Result:** ✓ Credentials are not stored during test, only tested transiently

### Test 32.6: Test Email Actually Sent (If Real SMTP Used)

**Steps:**
1. Configure real Gmail SMTP credentials:
   - Host: smtp.gmail.com
   - Port: 587
   - Username: your-email@gmail.com
   - Password: your-app-password (not your Gmail password)
   - From Name: Test Restaurant
   - From Email: your-email@gmail.com
2. Click "Send test email"
3. Check your email inbox
4. Verify you received a test email from "Test Restaurant <your-email@gmail.com>"

**Expected Result:** ✓ Test email is actually sent to the configured address

---

## Troubleshooting

### Setup Wizard Not Appearing

**Problem:** Redirected to `/tables` instead of `/setup`

**Solution:**
1. Check if setup is already marked complete:
   ```sql
   SELECT * FROM app_config WHERE key = 'setup_completed';
   ```
2. If it exists, delete it:
   ```sql
   DELETE FROM app_config WHERE key = 'setup_completed';
   ```
3. Refresh the browser

### Data Not Persisting

**Problem:** Form data is lost when navigating between steps

**Solution:**
1. Check browser console for JavaScript errors
2. Verify localStorage is enabled in browser settings
3. Check that `setup_wizard_progress` is being written to localStorage:
   - Open DevTools → Application → Local Storage
   - Look for `setup_wizard_progress` key

### SMTP Test Failing

**Problem:** "Test email failed" error

**Solution:**
1. Verify SMTP credentials are correct
2. For Gmail, use an "App Password" (not your Gmail password)
3. Enable "Less secure app access" if using Gmail
4. Check firewall/network allows outbound SMTP (port 587 or 465)
5. Verify the "From Email" address matches the SMTP username

### Mobile Layout Issues

**Problem:** Form fields are cut off or overlapping on mobile

**Solution:**
1. Verify viewport is set correctly in HTML:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   ```
2. Check CSS media queries are applied correctly
3. Test with actual mobile device, not just DevTools simulation

---

## Test Results Template

Use this template to document your manual testing results:

```
Test Date: _______________
Tester: ___________________
Browser: __________________
Device: ___________________

Task 30: Setup Wizard UI
- [ ] Test 30.1: Desktop rendering - PASS / FAIL
- [ ] Test 30.2: Mobile rendering - PASS / FAIL
- [ ] Test 30.3: Progress bar - PASS / FAIL
- [ ] Test 30.4: Back button - PASS / FAIL
- [ ] Test 30.5: Validation - PASS / FAIL
- [ ] Test 30.6: Error messages - PASS / FAIL
- [ ] Test 30.7: Auto-save - PASS / FAIL
- [ ] Test 30.8: Edit links - PASS / FAIL
- [ ] Test 30.9: Success screen - PASS / FAIL
- [ ] Test 30.10: Dashboard navigation - PASS / FAIL

Task 31: Qitchen Portal Coming Soon
- [ ] Test 31.1: Coming Soon before setup - PASS / FAIL
- [ ] Test 31.2: Normal flow after setup - PASS / FAIL
- [ ] Test 31.3: No redirect to /setup - PASS / FAIL
- [ ] Test 31.4: Mobile responsive - PASS / FAIL

Task 32: SMTP Test Email
- [ ] Test 32.1: Button disabled state - PASS / FAIL
- [ ] Test 32.2: API call - PASS / FAIL
- [ ] Test 32.3: Success banner - PASS / FAIL
- [ ] Test 32.4: Error message - PASS / FAIL
- [ ] Test 32.5: Credentials not stored - PASS / FAIL
- [ ] Test 32.6: Email actually sent - PASS / FAIL

Notes:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

---

## Automated Testing

For automated testing of the setup wizard, see:
- `src/tests/setup-integration.test.ts` - Integration tests for backend
- Frontend E2E tests (to be added in future)

Run integration tests:
```bash
npm run test:run -- src/tests/setup-integration.test.ts
```
