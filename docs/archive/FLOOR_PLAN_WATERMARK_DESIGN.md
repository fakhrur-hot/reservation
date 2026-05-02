# Floor Plan Table Card Watermark Design Guide

**Date:** April 18, 2026  
**Problem:** Table cards are difficult to identify at a glance - need large, non-interactive watermark-style table names

---

## 📋 Design Overview

The watermark should display the **table name prominently in the background** with these characteristics:

- **Large, semi-transparent text** (30-40px)
- **Positioned behind all interactive content** (non-interactive)
- **Rotated slightly** (-15° to 15°) for visual interest (optional)
- **High contrast** against the card background
- **Responsive** - scales with card size
- **Dark theme compatible**
- **Non-selectable** (no interference with text selection)

---

## 🎨 Design Comparison

### Current Issue
```
┌─────────────────────┐
│ 🪟 Window      ♿   │
│                     │
│ T1                  │
│ 👥 4 seats         │
│ AVAILABLE          │
│ [SELECT]            │
└─────────────────────┘
```
→ Hard to see table identity at a distance

### With Watermark
```
┌─────────────────────┐
│ 🪟 Window      ♿   │
│       T1            │  ← Large, faded
│       (watermark)   │     in background
│ T1                  │
│ 👥 4 seats         │
│ AVAILABLE          │
│ [SELECT]            │
└─────────────────────┘
```
→ **Clear table identity** at a glance

---

## 🔧 3 Implementation Approaches

### **Approach 1: CSS ::before Pseudo-Element** ✅ RECOMMENDED

**Pros:**
- ✅ No extra DOM elements
- ✅ Most performant
- ✅ Easy to customize with CSS only
- ✅ Fully responsive
- ✅ Non-interactive (pointer-events: none)

**Cons:**
- Limited text styling options

**Implementation:**

```typescript
// TableCard.tsx - No changes needed to component

// TableCard.css - Add this:
.table-card::before {
  content: attr(data-table-name);
  position: absolute;
  inset: 0;
  font-size: 48px;
  font-weight: 900;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.08);
  text-align: center;
  word-break: break-word;
  pointer-events: none;
  user-select: none;
  overflow: hidden;
  /* Optional rotation for visual interest */
  transform: rotate(-15deg) scale(1.2);
  z-index: 0;
}

.table-card-content {
  position: relative;
  z-index: 1;
}
```

**TSX Update:**
```typescript
<div
  className={`table-card table-card--${table.status}`}
  style={{
    borderColor: statusConfig.borderColor,
    backgroundColor: statusConfig.bgColor,
  }}
  data-table-name={table.name}  {/* Add this line */}
  // ... rest of props
>
```

---

### **Approach 2: SVG Background Image** 

**Pros:**
- ✅ Infinitely scalable
- ✅ Fine control over styling
- ✅ Can be generated dynamically
- ✅ Perfect for custom fonts
- ✅ Non-interactive

**Cons:**
- Slightly more complex
- Need to generate SVG string
- Performance impact with many cards

**Implementation:**

```typescript
// TableCard.tsx
import React from 'react';
import type { Table } from '../types';
import './TableCard.css';

function generateTableWatermark(tableName: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <defs>
        <style>
          .watermark-text {
            font-size: 48px;
            font-weight: 900;
            fill: rgba(0, 0, 0, 0.08);
            text-anchor: middle;
            dominant-baseline: middle;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
        </style>
      </defs>
      <g transform="translate(100, 100) rotate(-15)">
        <text class="watermark-text" x="0" y="0">${tableName}</text>
      </g>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function TableCard({
  table,
  onClick,
  onClear,
  onSelect,
  isClearing = false,
}: TableCardProps) {
  const statusConfig = STATUS_CONFIG[table.status];
  const watermarkUrl = generateTableWatermark(table.name);
  
  return (
    <div
      className={`table-card table-card--${table.status}`}
      style={{
        borderColor: statusConfig.borderColor,
        backgroundColor: statusConfig.bgColor,
        backgroundImage: `url('${watermarkUrl}')`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
      }}
      // ... rest of component
    >
```

---

### **Approach 3: Text Overlay with Opacity** 

**Pros:**
- ✅ Simplest to implement
- ✅ Fully readable code
- ✅ Easy to adjust opacity

**Cons:**
- Extra DOM element
- Takes up z-index space
- Less flexible styling

**Implementation:**

```typescript
// TableCard.tsx
export default function TableCard({
  table,
  onClick,
  onClear,
  onSelect,
  isClearing = false,
}: TableCardProps) {
  const statusConfig = STATUS_CONFIG[table.status];
  const isOccupied = table.status === 'occupied';
  const isAvailable = table.status === 'available';

  return (
    <div
      className={`table-card table-card--${table.status}`}
      style={{
        borderColor: statusConfig.borderColor,
        backgroundColor: statusConfig.bgColor,
      }}
      // ... rest
    >
      {/* Watermark Background */}
      <div className="table-card-watermark" aria-hidden="true">
        {table.name}
      </div>

      {/* Feature Badges */}
      {/* ... rest of component */}
```

```css
/* TableCard.css */
.table-card-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 900;
  color: rgba(0, 0, 0, 0.08);
  text-align: center;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  overflow: hidden;
  word-break: break-word;
  transform: rotate(-15deg) scale(1.2);
  z-index: 0;
}

.table-card-content {
  position: relative;
  z-index: 1;
}
```

---

## 📊 Approach Comparison Matrix

| Feature | CSS ::before | SVG Background | Text Overlay |
|---------|--------------|-----------------|--------------|
| **Complexity** | ⭐ Simple | ⭐⭐⭐ Complex | ⭐⭐ Medium |
| **Performance** | ⭐⭐⭐⭐⭐ Best | ⭐⭐⭐ Good | ⭐⭐⭐⭐ Good |
| **DOM Elements** | 0 extra | 0 extra | 1 extra |
| **Customization** | ⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Best | ⭐⭐⭐ Good |
| **Responsiveness** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐ Good |
| **Browser Support** | ✅ 99%+ | ✅ 99%+ | ✅ 100% |
| **Bundle Size Impact** | ➖ None | ➕ Tiny | ➕ Small |
| **Z-Index Management** | ✅ Built-in | ✅ Built-in | ⚠️ Manual |

---

## 🎯 Recommendation: Approach 1 (CSS ::before)

**Why it's the best choice:**

1. **Zero DOM overhead** - Uses CSS pseudo-elements
2. **Pure CSS solution** - No JavaScript needed after initial implementation
3. **Highest performance** - No SVG rendering, no extra elements
4. **Easy to modify** - Adjust opacity, size, rotation in CSS
5. **Responsive friendly** - Scales naturally with flexbox
6. **Future-proof** - Can add animations, transitions easily

---

## 💻 Complete Implementation (Recommended)

### Step 1: Update TableCard.tsx

```typescript
// Just add data attribute (minimal change)
<div
  className={`table-card table-card--${table.status}`}
  style={{
    borderColor: statusConfig.borderColor,
    backgroundColor: statusConfig.bgColor,
  }}
  data-table-name={table.name}  // ← ADD THIS
  onClick={() => onClick?.(table.id)}
  role="button"
  tabIndex={0}
  aria-label={`Table ${table.name}, ${statusConfig.label}, ${table.capacity} seats`}
  onKeyDown={(e) => e.key === 'Enter' && onClick?.(table.id)}
>
```

### Step 2: Update TableCard.css

Add this before the existing `.table-card-content` rule:

```css
/* ── Table Name Watermark ──────────────────────────────────────────── */

.table-card::before {
  content: attr(data-table-name);
  position: absolute;
  inset: 0;
  font-size: clamp(32px, 8vw, 60px);
  font-weight: 900;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.08);
  text-align: center;
  word-break: break-word;
  pointer-events: none;
  user-select: none;
  overflow: hidden;
  /* Subtle rotation for visual interest */
  transform: rotate(-12deg) scale(1.15);
  z-index: 0;
  /* Prevent text selection/highlight */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  text-rendering: optimizeLegibility;
  letter-spacing: -0.02em;
}

.table-card-content {
  position: relative;
  z-index: 1;
}
```

---

## 🎨 Customization Options

### Opacity Levels
```css
color: rgba(0, 0, 0, 0.08);  /* Subtle (current) */
color: rgba(0, 0, 0, 0.12);  /* More visible */
color: rgba(0, 0, 0, 0.15);  /* Bolder */
```

### Font Size Adjustments
```css
font-size: 40px;              /* Smaller */
font-size: 48px;              /* Default */
font-size: 56px;              /* Larger */
```

### Rotation Angles
```css
transform: rotate(0deg);      /* No rotation */
transform: rotate(-12deg);    /* Subtle left tilt */
transform: rotate(-20deg);    /* Strong left tilt */
transform: rotate(-30deg);    /* Dramatic tilt */
```

### Responsive Font Sizing
```css
/* Automatically scales on smaller screens */
font-size: clamp(28px, 6vw, 48px);
```

---

## 🧪 Testing Checklist

- [ ] Watermark appears behind content (z-index check)
- [ ] Non-interactive (click card, not watermark)
- [ ] Text not selectable
- [ ] Works on all status colors (available/locked/reserved/occupied)
- [ ] Responsive on mobile (still visible but doesn't overflow)
- [ ] Works with long table names (T1 vs "VIP-Booth-North-Window")
- [ ] Performance: No lag with 24+ cards
- [ ] Accessibility: aria-hidden not needed (pseudo-element)
- [ ] Dark/light theme: Opacity visible on all backgrounds
- [ ] Print view: Watermark visible or hidden as desired

---

## 📱 Responsive Behavior

The `clamp()` function makes it responsive automatically:

```
Phone (360px):  ~29px
Tablet (768px): ~41px
Desktop (1200px): ~51px
```

No additional media queries needed!

---

## 🚀 Implementation Order

1. **Update TableCard.tsx** - Add `data-table-name` attribute (1 line)
2. **Update TableCard.css** - Add `::before` styles (15 lines)
3. **Test** - View floor plan, verify watermark appears
4. **Adjust** - Tweak opacity/size/rotation as needed
5. **Verify** - Test on mobile, all statuses, long names

---

## 📝 Optional Enhancements

### Add subtle animation on hover
```css
.table-card:hover::before {
  color: rgba(0, 0, 0, 0.12);
  transition: color 0.3s ease;
}
```

### Different rotation per status
```css
.table-card--available::before { transform: rotate(-12deg) scale(1.15); }
.table-card--locked::before { transform: rotate(-10deg) scale(1.15); }
.table-card--reserved::before { transform: rotate(-14deg) scale(1.15); }
.table-card--occupied::before { transform: rotate(-12deg) scale(1.15); }
```

### Dynamic opacity based on status
```css
.table-card--available::before { color: rgba(0, 0, 0, 0.06); }
.table-card--locked::before { color: rgba(0, 0, 0, 0.08); }
.table-card--reserved::before { color: rgba(0, 0, 0, 0.10); }
.table-card--occupied::before { color: rgba(0, 0, 0, 0.12); }
```

---

## ✅ Benefits Summary

✨ **Improved Usability:**
- Table identity is **instantly visible**
- Easy to scan and identify tables at a distance
- Better visual hierarchy

🎨 **Better Design:**
- Professional, modern watermark effect
- Maintains existing card design
- Adds visual interest without clutter

⚡ **Performance:**
- Zero impact on rendering performance
- No JavaScript overhead
- Responsive without extra code

🔧 **Maintainability:**
- CSS-only solution
- Easy to adjust
- No breaking changes

---

**Ready to implement?** → Start with **Approach 1 (CSS ::before)** for best results!
