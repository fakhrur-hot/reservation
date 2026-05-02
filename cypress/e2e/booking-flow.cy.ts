// cypress/e2e/booking-flow.cy.ts
// E2E Tests for complete booking flow on desktop and mobile

describe('Booking Flow E2E Tests', () => {
  beforeEach(() => {
    // Reset app state before each test
    cy.visit('/');
    cy.clearLocalStorage();
  });

  describe('Desktop - Complete Booking Flow', () => {
    beforeEach(() => {
      // Set desktop viewport
      cy.viewport(1280, 720);
    });

    it('should complete a full booking from start to confirmation', () => {
      // Step 1: Select booking type
      cy.contains('button', 'Standard Dining').should('be.visible').click();
      cy.contains('button', 'Next').click();

      // Step 2: Enter promo code (optional)
      cy.get('input[placeholder*="Promo"]').type('EARLY10');
      cy.contains('button', 'Validate Code').click();
      cy.contains('Valid').should('be.visible');
      cy.contains('button', 'Next').click();

      // Step 3: Select date
      cy.get('input[type="date"]').focus().type('2026-04-25');
      cy.contains('button', 'Next').click();

      // Step 4: Select decoration
      cy.contains('label', 'No Decoration').click();
      cy.contains('button', 'Next').click();

      // Step 5: Select time
      cy.contains('button', '19:00').click();
      cy.contains('Locked for').should('be.visible'); // Verify lock acquired
      cy.contains('button', 'Next').click();

      // Step 6: Confirm booking
      cy.contains('p', 'Standard Dining').should('be.visible');
      cy.contains('p', '2026-04-25').should('be.visible');
      cy.contains('p', '19:00').should('be.visible');
      cy.contains('button', 'Confirm Booking').click();

      // Verify success
      cy.contains('Booking Confirmed').should('be.visible');
      cy.contains('button', 'View Confirmation').should('be.visible');
    });

    it('should handle promo code validation errors', () => {
      cy.contains('button', 'Standard Dining').click();
      cy.contains('button', 'Next').click();

      // Enter invalid promo code
      cy.get('input[placeholder*="Promo"]').type('INVALID_CODE');
      cy.contains('button', 'Validate Code').click();

      // Should show error
      cy.contains('Invalid promo code').should('be.visible');

      // Can proceed without promo code
      cy.contains('button', 'Skip').click();
      cy.contains('button', 'Next').click();
    });

    it('should reset state when changing booking type', () => {
      // Select standard booking
      cy.contains('button', 'Standard Dining').click();
      cy.contains('button', 'Next').click();

      // Go back and select decorated
      cy.contains('button', 'Back').click();
      cy.contains('button', 'Special Occasion').click();
      cy.contains('button', 'Next').click();

      // Previous selections should be cleared
      cy.get('input[placeholder*="Promo"]').should('have.value', '');
    });

    it('should display lock expiry warning', () => {
      cy.contains('button', 'Standard Dining').click();
      cy.contains('button', 'Next').click();
      cy.contains('button', 'Skip').click();
      cy.contains('button', 'Next').click();
      cy.get('input[type="date"]').type('2026-04-25');
      cy.contains('button', 'Next').click();
      cy.contains('button', 'Next').click();
      cy.contains('button', '19:00').click();

      // Verify lock acquired
      cy.contains('Minutes remaining').should('be.visible');
      cy.contains('button', 'Extend Lock').should('exist');
    });
  });

  describe('Mobile - Complete Booking Flow', () => {
    beforeEach(() => {
      // Set mobile viewport (iPhone SE)
      cy.viewport(375, 667);
    });

    it('should complete booking on mobile with touch-friendly controls', () => {
      // Step 1: Select booking type
      cy.contains('button', 'Standard Dining').should('be.visible');
      cy.get('button').contains('Standard Dining').should('have.css', 'min-height', '44px');
      cy.contains('button', 'Standard Dining').click();
      cy.contains('button', 'Next').click();

      // Step 2: Promo code (skip for brevity)
      cy.contains('button', 'Skip').click();
      cy.contains('button', 'Next').click();

      // Step 3: Select date
      cy.get('input[type="date"]').type('2026-04-25');
      cy.contains('button', 'Next').click();

      // Step 4: Decoration
      cy.contains('label', 'No Decoration').click();
      cy.contains('button', 'Next').click();

      // Step 5: Time selection
      cy.get('.time-slots-list').scrollIntoView();
      cy.contains('button', '19:00').click();
      cy.contains('button', 'Next').click();

      // Step 6: Confirm
      cy.contains('button', 'Confirm Booking').click();
      cy.contains('Booking Confirmed').should('be.visible');
    });

    it('should not require horizontal scrolling', () => {
      // Verify no horizontal scroll is needed
      cy.window().then(win => {
        expect(win.document.documentElement.scrollWidth).to.equal(
          win.document.documentElement.clientWidth
        );
      });
    });

    it('should have touch-friendly button sizes', () => {
      cy.contains('button', 'Standard Dining').should($el => {
        const height = $el.actual('height');
        expect(height).to.be.at.least(44); // Minimum 44px for touch
      });
    });
  });

  describe('Admin Dashboard - Real-time Updates', () => {
    beforeEach(() => {
      cy.viewport(1280, 720);
      cy.visit('/dashboard');
      cy.get('[data-testid="admin-auth"]').type('admin-token');
    });

    it('should display real-time table status updates via WebSocket', () => {
      // Verify floor plan loads
      cy.contains('Floor Plan').should('be.visible');

      // Find a table
      cy.get('[data-testid="table-card"]').first().as('table');
      cy.get('@table').should('have.class', 'status-available');

      // Simulate another user booking the table (via API)
      cy.request('POST', '/api/v1/tables/table-001/lock', {
        sessionId: 'test-session',
        durationMinutes: 30,
      });

      // Table status should update in real-time
      cy.get('@table').should('have.class', 'status-locked');
    });

    it('should display waitlist in real-time', () => {
      cy.contains('Waitlist').should('be.visible');
      cy.get('[data-testid="waitlist-empty"]').should('be.visible');

      // Simulate customer joining waitlist (via API)
      cy.request('POST', '/api/v1/waitlist', {
        branchId: 'branch-123',
        guestName: 'John Doe',
        partySize: 4,
      });

      // Waitlist should update in real-time
      cy.get('[data-testid="waitlist-item"]').should('have.length', 1);
      cy.contains('John Doe').should('be.visible');
    });

    it('should allow clearing occupied tables', () => {
      // Find occupied table
      cy.get('[data-testid="table-card"][class*="occupied"]').first().as('table');

      // Click clear button
      cy.get('@table').find('button').contains('Clear').click();

      // Confirm clear
      cy.contains('button', 'Confirm').click();

      // Table should update to available
      cy.get('@table').should('have.class', 'status-available');
    });
  });

  describe('Metrics Dashboard', () => {
    beforeEach(() => {
      cy.viewport(1280, 720);
      cy.visit('/admin/metrics');
    });

    it('should load and display metrics', () => {
      cy.contains('Analytics & Metrics Dashboard').should('be.visible');
      cy.contains('Booking Overview').should('be.visible');
      cy.contains('Revenue Summary').should('be.visible');
    });

    it('should allow filtering by date range', () => {
      cy.get('input[type="date"]').first().clear().type('2026-04-01');
      cy.get('input[type="date"]').last().clear().type('2026-04-16');

      // Metrics should reload (with loading state)
      cy.contains('Loading metrics').should.exist.or.not.exist;
      cy.contains('Total Bookings').should('be.visible');
    });

    it('should export metrics to CSV', () => {
      cy.get('button').contains('Export Metrics').click();

      // File should be downloaded
      cy.readFile('cypress/downloads/metrics-*.csv').should('exist');
    });

    it('should display alerts for anomalies', () => {
      cy.contains('Alerts & Anomalies').should('be.visible');
      // Alerts content depends on test data
      cy.get('[data-testid="alert"]').should('have.length.greaterThan', 0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      cy.viewport(1280, 720);
    });

    it('should handle network errors gracefully', () => {
      cy.intercept('/api/v1/available-slots', {
        forceNetworkError: true,
      });

      cy.visit('/');
      cy.contains('button', 'Standard Dining').click();
      cy.contains('button', 'Next').click();
      cy.contains('button', 'Next').click();

      // Should show error message
      cy.contains('Error loading available slots').should('be.visible');
      cy.contains('button', 'Try Again').should('be.visible');
    });

    it('should handle API errors with proper messages', () => {
      cy.intercept('/api/v1/promo-codes/validate', {
        statusCode: 401,
        body: { error: 'Unauthorized' },
      });

      cy.visit('/');
      cy.contains('button', 'Standard Dining').click();
      cy.contains('button', 'Next').click();
      cy.get('input[placeholder*="Promo"]').type('TEST');
      cy.contains('button', 'Validate Code').click();

      cy.contains('Unauthorized').should('be.visible');
    });
  });
});
