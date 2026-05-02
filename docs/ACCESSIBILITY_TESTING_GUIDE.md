# Accessibility Testing Guide (WCAG 2.1 AA)

**Status**: Comprehensive Testing Plan  
**Target**: WCAG 2.1 Level AA Compliance  
**Scope**: Desktop, Mobile, Screen Readers

---

## Overview

Accessibility testing ensures that the Sejiwa table reservation system is usable by everyone, including customers with disabilities. This guide covers automated testing, manual testing, and accessibility best practices.

---

## Accessibility Standards

### WCAG 2.1 Level AA Criteria

1. **Perceivable**: Information and components are visible and understandable
   - Text alternatives for images (1.1.1)
   - Sufficient color contrast (1.4.3)
   - Text can be resized (1.4.4)

2. **Operable**: Users can navigate and use all functionality
   - Keyboard accessible (2.1.1)
   - Focus visible (2.4.7)
   - No seizure-inducing content (2.3.1)

3. **Understandable**: Information is clear and predictable
   - Language identified (3.1.1)
   - Form labels (3.3.2)
   - Error messages helpful (3.3.4)

4. **Robust**: Works with assistive technology
   - Valid HTML (4.1.1)
   - ARIA labels (4.1.2)
   - Screen reader compatible (4.1.3)

---

## Automated Accessibility Testing

### Tool: axe DevTools

```bash
# Installation
npm install --save-dev @axe-core/react

# Testing component
import { axe, toHaveNoViolations } from 'jest-axe';

describe('BookingFlow component', () => {
  it('should not have any accessibility violations', async () => {
    const { container } = render(<BookingFlow />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### Tool: WAVE WebAIM

```javascript
// Using WAVE API for automated testing
const testWithWave = async (url) => {
  const response = await fetch(`https://wave.webaim.org/api/request?url=${url}`);
  const data = await response.json();

  console.log(`Errors: ${data.statistics.error}`);
  console.log(`Contrast errors: ${data.statistics.contrast}`);
  console.log(`Warnings: ${data.statistics.warning}`);
};
```

### Tool: Lighthouse (Chrome DevTools)

```javascript
// Running Lighthouse audit
import lighthouse from 'lighthouse';

const runLighthouse = async (url) => {
  const options = {
    logLevel: 'info',
    output: 'json',
    onlyCategories: ['accessibility'],
  };

  const runnerResult = await lighthouse(url, options);
  const audits = runnerResult.lhr.audits;

  console.log('Accessibility Score:', runnerResult.lhr.categories.accessibility.score * 100);
  console.log('Failures:', audits.filter(a => a.score < 1));
};
```

---

## Manual Accessibility Testing

### 1. Keyboard Navigation Testing

**Steps**:
1. Unplug mouse / disable trackpad
2. Navigate using Tab key only
3. Check that:
   - All interactive elements are reachable
   - Tab order is logical (top-to-bottom, left-to-right)
   - Focus indicator is visible
   - No keyboard traps (can always exit)

**Test Matrix**:

| Component | Keys Tested | Expected Behavior |
|-----------|-------------|-------------------|
| Text Input | Tab, Enter, Shift+Tab | Receive focus, allow typing, can tab out |
| Button | Tab, Enter/Space | Receive focus, trigger action on Enter/Space |
| Dropdown | Tab, Arrow keys, Enter | Focus dropdown, adjust value, confirm |
| Modal | Tab, Escape | Focus trap inside modal, Escape closes |
| Calendar | Tab, Arrow keys | Navigate dates, Tab cycles through |

**Keyboard Shortcuts** (Accessibility-first):
```
Tab           → Next element
Shift+Tab     → Previous element
Enter/Space   → Activate button/link
Escape        → Close modal/dropdown
Arrow keys    → Navigate within component
```

### 2. Screen Reader Testing

**Recommended Readers**:
- **NVDA** (Windows, Free): https://www.nvaccess.org/
- **JAWS** (Windows, Commercial)
- **VoiceOver** (Mac, Built-in)
- **TalkBack** (Android, Built-in)
- **Screen Reader** (iOS, Built-in)

**Test Scenarios**:

#### Booking Flow with NVDA

1. **Step 1: Booking Type**
   ```
   NVDA announces: "Booking type selection, group box"
   Tab: Should hear all options (Standard Dining, Special Occasion)
   Expected: Clear heading, radio buttons announced
   ```

2. **Step 2: Promo Code**
   ```
   NVDA announces: "Promo code input, edit text"
   Type: Should provide real-time validation feedback
   Expected: "Valid code" or error message
   ```

3. **Step 3: Date Selection**
   ```
   NVDA announces: "Date picker, calendar widget"
   Arrow keys: Navigate dates
   Expected: Date format announced (April 25, 2026)
   ```

4. **Step 4: Decoration**
   ```
   NVDA announces: "Decoration options, checkbox group"
   Expected: All color options listed with descriptions
   ```

5. **Step 5: Time Selection**
   ```
   NVDA announces: "Time slots, list"
   Tab: Each slot should have full details
   Expected: "Start 7 PM, End 8:30 PM, Duration 1 hour 30 minutes"
   ```

6. **Step 6: Confirmation**
   ```
   NVDA announces: "Reservation summary, region"
   Expected: All booking details in logical order
   Confirm: "Confirm reservation, button"
   ```

**Critical Announcements**:
- Form labels (linked to inputs)
- Required field indicators
- Error messages (associated with fields)
- Success messages (announce when reservation created)
- Loading states ("Loading available times...")

### 3. Color Contrast Testing

**Tool 1: WAVE Contrast Checker**
1. Right-click element → Inspect
2. Open WAVE extension
3. Check: Contrast Errors / Warnings tab

**Tool 2: Programmatic Check**

```javascript
const checkContrast = (el) => {
  const bgColor = window.getComputedStyle(el).backgroundColor;
  const textColor = window.getComputedStyle(el).color;

  // Calculate relative luminance
  const getLuminance = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance <= 0.03928
      ? luminance / 12.92
      : Math.pow((luminance + 0.055) / 1.055, 2.4);
  };

  const l1 = getLuminance(bgColor);
  const l2 = getLuminance(textColor);
  const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return {
    contrast,
    wcagAA: contrast >= 4.5, // Normal text >= 4.5:1
    wcagAALarge: contrast >= 3, // Large text >= 3:1
  };
};
```

**Minimum Ratios**:
- Normal text: 4.5:1
- Large text (18pt+): 3:1
- UI components: 3:1
- Focus indicators: 3:1

### 4. Mobile Accessibility Testing

**Device Testing** (actual devices preferred):
- iPhone 12 mini (5.4", smallest common)
- iPhone 12 (6.1", standard)
- iPad (tablets)
- Android phone

**Touch Target Sizes**:
- Minimum: 44x44 pixels (WCAG AA)
- Recommended: 48x48 pixels
- Spacing: 8px minimum between targets

**Test Cases**:
```javascript
// Automated touch target size testing
const checkTouchTargets = () => {
  const interactiveElements = document.querySelectorAll(
    'button, a, input, select, textarea, [role="button"]'
  );

  interactiveElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (width < 44 || height < 44) {
      console.warn(`Touch target too small: ${el.tagName} (${width}x${height})`);
    }
  });
};
```

---

## Test Cases by Component

### Booking Form Components

#### Text Input Fields
```
✓ Label properly associated (<label for="...">)
✓ Placeholder is not used as label
✓ Error messages linked via aria-describedby
✓ Required field indicator visible
✓ Sufficient padding for readability
✓ Error state announced to screen readers
```

#### Date Picker
```
✓ Month/year navigation with arrow keys
✓ Day selection with arrow keys or typing
✓ All dates announced clearly
✓ Current date highlighted
✓ Selected date announced
✓ Calendar grid structure conveyed
```

#### Dropdown/Select
```
✓ Label associated with control
✓ All options announced
✓ Current selection announced
✓ Arrow keys navigate options
✓ Enter/Space confirms selection
```

#### Radio Buttons
```
✓ Grouped with <fieldset> and <legend>
✓ Each button has associated label
✓ Arrow keys navigate options
✓ Current selection announced
✓ Selection change announced
```

#### Modal Dialog
```
✓ Focus trapped inside modal
✓ Modal role applied
✓ Heading announced
✓ Escape closes modal
✓ Focus returns to trigger element
✓ Background content not keyboard accessible
```

---

## ARIA Implementation Examples

### Booking Form Structure

```html
<!-- Good: Semantic form -->
<form>
  <fieldset>
    <legend>Booking Type</legend>
    
    <label>
      <input type="radio" name="bookingType" value="standard" />
      Standard Dining
    </label>
    
    <label>
      <input type="radio" name="bookingType" value="decorated" />
      Special Occasion
    </label>
  </fieldset>

  <div>
    <label for="promoCode">Promo Code (Optional):</label>
    <input
      id="promoCode"
      type="text"
      aria-describedby="promoHelp"
      aria-invalid="false"
    />
    <span id="promoHelp">Enter your 6-character promo code</span>
  </div>

  <div>
    <label for="dateInput">Select Date:</label>
    <input
      id="dateInput"
      type="date"
      aria-label="Reservation date"
      aria-required="true"
    />
  </div>

  <button type="submit" aria-label="Confirm reservation">
    Confirm
  </button>
</form>
```

### Validation Feedback

```html
<!-- Form field with error -->
<div>
  <label for="email">Email Address:</label>
  <input
    id="email"
    type="email"
    aria-describedby="emailError"
    aria-invalid="true"
  />
  <span id="emailError" role="alert">
    Please enter a valid email address
  </span>
</div>

<!-- Success state -->
<div>
  <label for="phone">Phone Number:</label>
  <input
    id="phone"
    type="tel"
    aria-describedby="phoneHelp"
    aria-invalid="false"
  />
  <span id="phoneHelp">✓ Phone number valid</span>
</div>
```

### Live Regions (Real-time Updates)

```html
<!-- Announcements to screen readers -->
<div aria-live="polite" aria-atomic="true">
  <!-- Content updated dynamically -->
</div>

<!-- For time-sensitive information -->
<div aria-live="assertive" aria-atomic="true">
  <!-- Lock expiring in 4 minutes! -->
</div>

<!-- Lock expiry timer -->
<div
  aria-live="assertive"
  aria-label="Lock expiry timer showing minutes and seconds remaining"
>
  04:32
</div>
```

### Loading and Progress

```html
<!-- During booking submission -->
<div aria-busy="true" aria-label="Reserving your table...">
  <span role="status">Processing your reservation...</span>
</div>

<!-- After completion -->
<div aria-busy="false" role="status">
  ✓ Reservation confirmed. Reference: REF-20260420-001
</div>
```

---

## Testing Checklist

### Pre-Launch Accessibility Audit

- [ ] **Keyboard Navigation**
  - [ ] All interactive elements reachable via Tab
  - [ ] Tab order is logical
  - [ ] Focus indicator always visible
  - [ ] No keyboard traps
  - [ ] Escape closes modals

- [ ] **Color & Contrast**
  - [ ] All text 4.5:1 contrast minimum
  - [ ] Large text 3:1 contrast minimum
  - [ ] Color not sole means of conveying information
  - [ ] No flickering/flashing content

- [ ] **Forms & Labels**
  - [ ] All inputs have associated labels
  - [ ] Required fields marked
  - [ ] Error messages clear
  - [ ] Submission confirmed

- [ ] **Screen Readers**
  - [ ] Page structure semantic
  - [ ] Headings properly nested (h1-h6)
  - [ ] Lists use <ul>/<ol>
  - [ ] Images have alt text
  - [ ] Form labels announced

- [ ] **Mobile**
  - [ ] Touch targets ≥44px
  - [ ] Buttons properly spaced
  - [ ] Zoom works to 200%
  - [ ] Text resizable
  - [ ] Works in portrait & landscape

- [ ] **Documentation**
  - [ ] Accessibility statement published
  - [ ] Keyboard shortcuts documented
  - [ ] Known issues listed
  - [ ] Contact for accessibility issues

---

## Accessibility Testing Report Template

```markdown
# Accessibility Audit Report
Date: April 16, 2026
Tested By: [Name]
Tool: WAVE, NVDA, axe DevTools

## Summary
- Violations Found: X
- Warnings: Y
- WCAG AA Compliant: Yes/No

## Critical Issues (Must Fix)
1. [Issue]
   - Component: [which component]
   - Impact: [affects which users]
   - Fix: [recommendation]

## Warnings (Should Fix)
1. [Warning]
   - Component: [which component]
   - Severity: [Low/Medium/High]

## Passed Checks
- Keyboard navigation ✓
- Color contrast ✓
- Screen reader compatibility ✓
- Mobile responsive ✓

## Recommendations
1. [Recommendation for improvement]
2. [Recommendation for improvement]
```

---

## Accessibility Training

### For Developers

1. **Semantic HTML First**
   - Use `<button>` not `<div onclick>`
   - Use `<label>` for form inputs
   - Use heading hierarchy (h1-h6)
   - Use `<nav>`, `<main>`, `<footer>`

2. **ARIA When Needed**
   - Don't add ARIA to semantic elements
   - Test with screen readers before using custom roles
   - Maintain keyboard support when using ARIA

3. **Testing Regularly**
   - Run automated tests in CI/CD
   - Manual keyboard navigation testing
   - At least quarterly screen reader testing

### For Designers

1. **Contrast & Color**
   - Minimum 4.5:1 for normal text
   - Test with accessibility tools
   - Don't rely on color alone

2. **Touch Targets**
   - Minimum 44x44 pixels
   - At least 8px spacing
   - Avoid tiny buttons/links

3. **Reading Order**
   - Order follows visual layout
   - Clear hierarchy
   - Logical grouping

---

## Resources & Tools

### Automated Testing Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)
- [LightHouse](https://developers.google.com/web/tools/lighthouse)
- [Pa11y](https://pa11y.org/)

### Screen Readers
- [NVDA (Free, Windows)](https://www.nvaccess.org/)
- [JAWS (Commercial, Windows/Mac)](https://www.freedomscientific.com/)
- [VoiceOver (Mac/iOS, Built-in)](https://www.apple.com/voiceover/)
- [TalkBack (Android, Built-in)](https://support.google.com/accessibility)

### Learning Resources
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Articles](https://webaim.org/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [A11y Project](https://www.a11yproject.com/)

---

## Success Criteria

✅ **Pre-Launch**
- [ ] WCAG AA compliant
- [ ] No critical violations
- [ ] Keyboard navigation complete
- [ ] Screen reader compatible
- [ ] Touch targets 44x44px minimum
- [ ] Color contrast 4.5:1 minimum

✅ **Ongoing**
- [ ] Accessibility tests in CI/CD
- [ ] Monthly spot checks
- [ ] Quarterly full audit
- [ ] User feedback loop

---

**Next Steps**: Deploy automated testing to CI/CD, conduct manual audit
