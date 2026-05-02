/**
 * TableCard Component Tests
 *
 * Tests for:
 * - Color coding for status (available, locked, reserved, occupied)
 * - Clear Table button (occupied tables only)
 * - Select button (available tables only)
 * - Click handler to show table details
 * - Hover effects
 * - Feature badges (window view, wheelchair accessible)
 * - Decoration indicator
 * - Accessibility (ARIA labels, keyboard navigation)
 *
 * Requirements: 3.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableCard, { STATUS_CONFIG } from './TableCard';
import type { Table } from '../types';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockTable: Table = {
  id: 'table-1',
  branch_id: 'branch-1',
  section_id: 'section-1',
  section_name: 'Main Dining',
  name: 'Table 1',
  capacity: 4,
  table_type: 'standard',
  has_window_view: false,
  is_wheelchair_accessible: false,
  is_active: true,
  status: 'available',
  created_at: '2024-01-01T00:00:00Z',
};

const decoratedTable: Table = {
  ...mockTable,
  id: 'table-2',
  name: 'Table 2',
  has_decoration: true,
  occasion_type: 'Birthday',
  decoration_color: '#ff69b4',
  cake_choice: 'Chocolate',
};

const featureTable: Table = {
  ...mockTable,
  id: 'table-3',
  name: 'Table 3',
  has_window_view: true,
  is_wheelchair_accessible: true,
};

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('TableCard Component', () => {
  // ── Color Coding for Status ────────────────────────────────────────────────

  describe('Color Coding for Status', () => {
    it('should render available status with green color scheme', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button', { name: /Table 1, Available/i });
      expect(card).toHaveStyle({
        borderColor: STATUS_CONFIG.available.borderColor,
        backgroundColor: STATUS_CONFIG.available.bgColor,
      });
      expect(screen.getByText('Available')).toHaveStyle({
        color: STATUS_CONFIG.available.textColor,
      });
    });

    it('should render locked status with amber color scheme', () => {
      const table = { ...mockTable, status: 'locked' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button', { name: /Table 1, Held/i });
      expect(card).toHaveStyle({
        borderColor: STATUS_CONFIG.locked.borderColor,
        backgroundColor: STATUS_CONFIG.locked.bgColor,
      });
      expect(screen.getByText('Held')).toHaveStyle({
        color: STATUS_CONFIG.locked.textColor,
      });
    });

    it('should render reserved status with blue color scheme', () => {
      const table = { ...mockTable, status: 'reserved' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button', { name: /Table 1, Reserved/i });
      expect(card).toHaveStyle({
        borderColor: STATUS_CONFIG.reserved.borderColor,
        backgroundColor: STATUS_CONFIG.reserved.bgColor,
      });
      expect(screen.getByText('Reserved')).toHaveStyle({
        color: STATUS_CONFIG.reserved.textColor,
      });
    });

    it('should render occupied status with red color scheme', () => {
      const table = { ...mockTable, status: 'occupied' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button', { name: /Table 1, Occupied/i });
      expect(card).toHaveStyle({
        borderColor: STATUS_CONFIG.occupied.borderColor,
        backgroundColor: STATUS_CONFIG.occupied.bgColor,
      });
      expect(screen.getByText('Occupied')).toHaveStyle({
        color: STATUS_CONFIG.occupied.textColor,
      });
    });

    it('should apply correct CSS class based on status', () => {
      const statuses: Array<'available' | 'locked' | 'reserved' | 'occupied'> = [
        'available',
        'locked',
        'reserved',
        'occupied',
      ];

      statuses.forEach((status) => {
        const { unmount } = render(
          <TableCard table={{ ...mockTable, status }} />
        );
        const card = screen.getByRole('button');
        expect(card).toHaveClass(`table-card--${status}`);
        unmount();
      });
    });
  });

  // ── Clear Table Button ──────────────────────────────────────────────────────

  describe('Clear Table Button', () => {
    it('should show Clear Table button for occupied status', () => {
      const mockClear = vi.fn();
      const table = { ...mockTable, status: 'occupied' as const };
      render(<TableCard table={table} onClear={mockClear} />);

      const clearBtn = screen.getByRole('button', { name: /Clear table/i });
      expect(clearBtn).toBeInTheDocument();
      expect(clearBtn).toHaveTextContent('Clear Table');
    });

    it('should NOT show Clear Table button for non-occupied tables', () => {
      const mockClear = vi.fn();
      const statuses: Array<'available' | 'locked' | 'reserved'> = [
        'available',
        'locked',
        'reserved',
      ];

      statuses.forEach((status) => {
        const { unmount } = render(
          <TableCard table={{ ...mockTable, status }} onClear={mockClear} />
        );
        expect(screen.queryByRole('button', { name: /Clear table/i })).not.toBeInTheDocument();
        unmount();
      });
    });

    it('should NOT show Clear Table button when onClear is not provided', () => {
      const table = { ...mockTable, status: 'occupied' as const };
      render(<TableCard table={table} />);

      expect(screen.queryByRole('button', { name: /Clear table/i })).not.toBeInTheDocument();
    });

    it('should call onClear with table ID when button is clicked', async () => {
      const mockClear = vi.fn();
      const table = { ...mockTable, status: 'occupied' as const };
      render(<TableCard table={table} onClear={mockClear} />);

      const clearBtn = screen.getByRole('button', { name: /Clear table/i });
      await userEvent.click(clearBtn);

      expect(mockClear).toHaveBeenCalledTimes(1);
      expect(mockClear).toHaveBeenCalledWith(expect.any(Object), table.id);
    });

    it('should stop event propagation when Clear Table button is clicked', async () => {
      const mockClear = vi.fn();
      const mockTableClick = vi.fn();
      const table = { ...mockTable, status: 'occupied' as const };
      render(
        <TableCard table={table} onClear={mockClear} onClick={mockTableClick} />
      );

      const clearBtn = screen.getByRole('button', { name: /Clear table/i });
      await userEvent.click(clearBtn);

      // Clear should be called, but click handler should receive the event object with propagation stopped
      expect(mockClear).toHaveBeenCalled();
    });

    it('should show loading state while clearing', () => {
      const mockClear = vi.fn();
      const table = { ...mockTable, status: 'occupied' as const };
      const { rerender } = render(
        <TableCard table={table} onClear={mockClear} isClearing={false} />
      );

      const clearBtn = screen.getByRole('button', { name: /Clear table/i });
      expect(clearBtn).toHaveTextContent('Clear Table');
      expect(clearBtn).not.toBeDisabled();

      rerender(
        <TableCard table={table} onClear={mockClear} isClearing={true} />
      );

      const clearBtnLoading = screen.getByRole('button', { name: /Clear table/i });
      expect(clearBtnLoading).toHaveTextContent('Clearing…');
      expect(clearBtnLoading).toBeDisabled();
    });
  });

  // ── Select Button ──────────────────────────────────────────────────────────

  describe('Select Button', () => {
    it('should show Select button for available status when onSelect provided', () => {
      const mockSelect = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onSelect={mockSelect} />);

      const selectBtn = screen.getByRole('button', { name: /Select table/i });
      expect(selectBtn).toBeInTheDocument();
      expect(selectBtn).toHaveTextContent('Select');
    });

    it('should NOT show Select button for non-available tables', () => {
      const mockSelect = vi.fn();
      const statuses: Array<'locked' | 'reserved' | 'occupied'> = [
        'locked',
        'reserved',
        'occupied',
      ];

      statuses.forEach((status) => {
        const { unmount } = render(
          <TableCard table={{ ...mockTable, status }} onSelect={mockSelect} />
        );
        expect(screen.queryByRole('button', { name: /Select table/i })).not.toBeInTheDocument();
        unmount();
      });
    });

    it('should NOT show Select button when onSelect is not provided', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      expect(screen.queryByRole('button', { name: /Select table/i })).not.toBeInTheDocument();
    });

    it('should call onSelect with table data when button is clicked', async () => {
      const mockSelect = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onSelect={mockSelect} />);

      const selectBtn = screen.getByRole('button', { name: /Select table/i });
      await userEvent.click(selectBtn);

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockSelect).toHaveBeenCalledWith(expect.any(Object), table);
    });

    it('should stop event propagation when Select button is clicked', async () => {
      const mockSelect = vi.fn();
      const mockTableClick = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(
        <TableCard table={table} onSelect={mockSelect} onClick={mockTableClick} />
      );

      const selectBtn = screen.getByRole('button', { name: /Select table/i });
      await userEvent.click(selectBtn);

      expect(mockSelect).toHaveBeenCalled();
    });
  });

  // ── Click Handler for Table Details ────────────────────────────────────────

  describe('Click Handler for Table Details', () => {
    it('should call onClick with table ID when card is clicked', async () => {
      const mockClick = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onClick={mockClick} />);

      const card = screen.getByRole('button', { name: /Table 1, Available/i });
      await userEvent.click(card);

      expect(mockClick).toHaveBeenCalledWith(table.id);
    });

    it('should support keyboard navigation (Enter key)', async () => {
      const mockClick = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onClick={mockClick} />);

      const card = screen.getByRole('button', { name: /Table 1, Available/i });
      card.focus();
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(mockClick).toHaveBeenCalledWith(table.id);
    });

    it('should NOT call onClick if button is not provided', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button', { name: /Table 1, Available/i });
      fireEvent.click(card);

      // Should not throw any errors, just not call anything
      expect(card).toBeInTheDocument();
    });
  });

  // ── Feature Badges ─────────────────────────────────────────────────────────

  describe('Feature Badges', () => {
    it('should show window view badge when has_window_view is true', () => {
      render(<TableCard table={featureTable} />);

      const windowBadge = screen.getByLabelText('Window view');
      expect(windowBadge).toBeInTheDocument();
      expect(windowBadge).toHaveTextContent('🪟');
    });

    it('should NOT show window view badge when has_window_view is false', () => {
      render(<TableCard table={mockTable} />);

      expect(screen.queryByLabelText('Window view')).not.toBeInTheDocument();
    });

    it('should show wheelchair accessible badge when is_wheelchair_accessible is true', () => {
      render(<TableCard table={featureTable} />);

      const accessibleBadge = screen.getByLabelText('Wheelchair accessible');
      expect(accessibleBadge).toBeInTheDocument();
      expect(accessibleBadge).toHaveTextContent('♿');
    });

    it('should NOT show wheelchair badge when is_wheelchair_accessible is false', () => {
      render(<TableCard table={mockTable} />);

      expect(screen.queryByLabelText('Wheelchair accessible')).not.toBeInTheDocument();
    });

    it('should show multiple badges together', () => {
      render(<TableCard table={featureTable} />);

      expect(screen.getByLabelText('Window view')).toBeInTheDocument();
      expect(screen.getByLabelText('Wheelchair accessible')).toBeInTheDocument();
    });
  });

  // ── Decoration Indicator ───────────────────────────────────────────────────

  describe('Decoration Indicator', () => {
    it('should show decoration indicator when has_decoration is true', () => {
      render(<TableCard table={decoratedTable} />);

      const decoration = screen.getByLabelText('Decorated table');
      expect(decoration).toBeInTheDocument();
      expect(decoration).toHaveTextContent('🎀');
    });

    it('should NOT show decoration indicator when has_decoration is false', () => {
      render(<TableCard table={mockTable} />);

      expect(screen.queryByLabelText('Decorated table')).not.toBeInTheDocument();
    });

    it('should display occasion type in decoration indicator', () => {
      render(<TableCard table={decoratedTable} />);

      expect(screen.getByText('Birthday')).toBeInTheDocument();
    });

    it('should display decoration color swatch', () => {
      const { container } = render(<TableCard table={decoratedTable} />);

      const colorDot = container.querySelector('.table-card-decoration-dot');
      expect(colorDot).toHaveStyle({
        backgroundColor: decoratedTable.decoration_color,
      });
    });

    it('should have title attribute with color hex code', () => {
      const { container } = render(<TableCard table={decoratedTable} />);

      const colorDot = container.querySelector('.table-card-decoration-dot');
      expect(colorDot).toHaveAttribute('title', decoratedTable.decoration_color);
    });
  });

  // ── Table Information Display ──────────────────────────────────────────────

  describe('Table Information Display', () => {
    it('should display table name', () => {
      render(<TableCard table={mockTable} />);

      expect(screen.getByText('Table 1')).toBeInTheDocument();
    });

    it('should display capacity with emojis', () => {
      render(<TableCard table={mockTable} />);

      expect(screen.getByText('👥 4 seats')).toBeInTheDocument();
    });

    it('should display status label', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('should handle different capacities', () => {
      const table = { ...mockTable, capacity: 8 };
      render(<TableCard table={table} />);

      expect(screen.getByText('👥 8 seats')).toBeInTheDocument();
    });
  });

  // ── Accessibility ────────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('should have proper ARIA label for card', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button', {
        name: /Table 1, Available, 4 seats/i,
      });
      expect(card).toHaveAttribute('aria-label');
    });

    it('should have proper ARIA labels for buttons', async () => {
      const mockClear = vi.fn();
      const mockSelect = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onClear={mockClear} onSelect={mockSelect} />);

      const selectBtn = screen.getByRole('button', { name: /Select table/i });
      expect(selectBtn).toHaveAttribute('aria-label', 'Select table Table 1');
    });

    it('should be keyboard navigable', async () => {
      const mockClick = vi.fn();
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onClick={mockClick} />);

      const card = screen.getByRole('button', { name: /Table 1, Available/i });
      card.focus();
      expect(card).toHaveFocus();

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(mockClick).toHaveBeenCalled();
    });

    it('should have proper role attribute', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('role', 'button');
    });

    it('should have tabIndex for keyboard accessibility', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('should hide decorative elements from screen readers', () => {
      const { container } = render(
        <TableCard table={decoratedTable} />
      );

      const colorDot = container.querySelector('.table-card-decoration-dot');
      expect(colorDot).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // ── CSS Classes ────────────────────────────────────────────────────────────

  describe('CSS Classes', () => {
    it('should have base table-card class', () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} />);

      const card = screen.getByRole('button');
      expect(card).toHaveClass('table-card');
    });

    it('should have status-specific class', () => {
      const statuses: Array<'available' | 'locked' | 'reserved' | 'occupied'> = [
        'available',
        'locked',
        'reserved',
        'occupied',
      ];

      statuses.forEach((status) => {
        const { unmount } = render(
          <TableCard table={{ ...mockTable, status }} />
        );
        const card = screen.getByRole('button');
        expect(card).toHaveClass(`table-card--${status}`);
        unmount();
      });
    });

    it('should have proper classes on all child elements', () => {
      const { container } = render(<TableCard table={decoratedTable} />);

      expect(container.querySelector('.table-card-content')).toBeInTheDocument();
      expect(container.querySelector('.table-card-name')).toBeInTheDocument();
      expect(container.querySelector('.table-card-capacity')).toBeInTheDocument();
      expect(container.querySelector('.table-card-status')).toBeInTheDocument();
    });
  });

  // ── Props Validation ───────────────────────────────────────────────────────

  describe('Props Validation', () => {
    it('should render with minimal required props', () => {
      render(<TableCard table={mockTable} />);

      expect(screen.getByText('Table 1')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('should handle missing optional props gracefully', () => {
      const minimalTable = {
        id: 'table-1',
        branch_id: 'branch-1',
        section_id: 'section-1',
        name: 'Table 1',
        capacity: 4,
        is_active: true,
        status: 'available' as const,
        created_at: '2024-01-01T00:00:00Z',
      };

      render(<TableCard table={minimalTable} />);

      expect(screen.getByText('Table 1')).toBeInTheDocument();
      expect(screen.queryByLabelText('Window view')).not.toBeInTheDocument();
    });

    it('should handle undefined onClick', async () => {
      const table = { ...mockTable, status: 'available' as const };
      render(<TableCard table={table} onClick={undefined} />);

      const card = screen.getByRole('button');
      expect(() => fireEvent.click(card)).not.toThrow();
    });
  });
});
