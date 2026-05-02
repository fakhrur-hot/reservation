import { useState, useRef, useEffect, useCallback } from 'react';
import './DateTimePicker.css';

const ITEM_HEIGHT = 50;

interface ScrollPickerProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  label?: string;
}

function ScrollPicker({ items, selectedIndex, onSelect, label }: ScrollPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedIndex);
  const throttledRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef({ y: 0, scrollTop: 0 });
  const isDraggingRef = useRef(false);

  // Keep ref in sync so the wheel handler always has the latest value
  selectedRef.current = selectedIndex;

  // Scroll to item on mount and external change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = selectedIndex * ITEM_HEIGHT;
    }
  }, [selectedIndex]);

  // Snap after touch/drag scroll stops
  const scheduleSnap = useCallback(() => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      scrollRef.current.scrollTop = clamped * ITEM_HEIGHT;
      onSelect(clamped);
    }, 100);
  }, [items.length, onSelect]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    isDraggingRef.current = true;
    dragStartRef.current = {
      y: e.clientY,
      scrollTop: scrollRef.current?.scrollTop || 0,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    const diff = e.clientY - dragStartRef.current.y;
    // Invert: moving mouse down = scroll down (positive diff = negative scroll)
    scrollRef.current.scrollTop = dragStartRef.current.scrollTop - diff;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    scheduleSnap();
  };

  // Attach native wheel listener with passive:false so preventDefault works
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (throttledRef.current) return;
      throttledRef.current = true;
      setTimeout(() => { throttledRef.current = false; }, 160);

      const direction = e.deltaY > 0 ? 1 : -1;
      const next = Math.max(0, Math.min(selectedRef.current + direction, items.length - 1));
      el.scrollTop = next * ITEM_HEIGHT;
      onSelect(next);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [items.length, onSelect]);

  return (
    <div className="dtp-scroll-picker">
      {label && <div className="dtp-label">{label}</div>}
      <div className="dtp-scroll-wrapper">
        <div className="dtp-highlight" />
        <div
          ref={scrollRef}
          className="dtp-scroll-container"
          onScroll={scheduleSnap}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{ height: ITEM_HEIGHT * 2, flexShrink: 0 }} />
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`dtp-scroll-item ${idx === selectedIndex ? 'dtp-scroll-item--selected' : ''}`}
            >
              {item}
            </div>
          ))}
          <div style={{ height: ITEM_HEIGHT * 2, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

interface DatePickerProps {
  onDateConfirm: (date: string) => void;
  minDate?: string;
}

export function DatePicker({ onDateConfirm, minDate }: DatePickerProps) {
  const min = minDate ? new Date(minDate) : new Date();

  const dateOptions = Array.from({ length: 90 }, (_, i) => {
    const date = new Date(min);
    date.setDate(date.getDate() + i);
    return {
      label: date.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' }),
      value: date.toISOString().split('T')[0],
    };
  });

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    await new Promise(r => setTimeout(r, 300));
    onDateConfirm(dateOptions[selectedIdx].value);
    setIsConfirming(false);
  };

  return (
    <div className="dtp-container dtp-fade-in">
      <div className="dtp-picker-wrapper">
        <ScrollPicker
          items={dateOptions.map(d => d.label)}
          selectedIndex={selectedIdx}
          onSelect={setSelectedIdx}
          label="Date"
        />
        <button className="dtp-confirm-btn" onClick={handleConfirm} disabled={isConfirming}>
          {isConfirming ? 'Recording…' : 'Confirm Date →'}
        </button>
      </div>
    </div>
  );
}

// ─── TimePicker ───────────────────────────────────────────────────────────────

interface TimePickerProps {
  onTimeConfirm: (time: string) => void;
}

export function TimePicker({ onTimeConfirm }: TimePickerProps) {
  const timeOptions = Array.from({ length: 25 }, (_, i) => {
    const hour = 10 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return {
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  });

  const [selectedTimeIdx, setSelectedTimeIdx] = useState(0);
  const [selectedAmpmIdx, setSelectedAmpmIdx] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    await new Promise(r => setTimeout(r, 300));
    const ampm = ['AM', 'PM'][selectedAmpmIdx];
    onTimeConfirm(`${timeOptions[selectedTimeIdx].value} ${ampm}`);
    setIsConfirming(false);
  };

  return (
    <div className="dtp-container dtp-fade-in">
      <div className="dtp-picker-wrapper">
        <div className="dtp-time-pickers">
          <ScrollPicker
            items={timeOptions.map(t => t.label)}
            selectedIndex={selectedTimeIdx}
            onSelect={setSelectedTimeIdx}
            label="Time"
          />
          <div className="dtp-separator">•</div>
          <ScrollPicker
            items={['AM', 'PM']}
            selectedIndex={selectedAmpmIdx}
            onSelect={setSelectedAmpmIdx}
            label="Period"
          />
        </div>
        <button className="dtp-confirm-btn" onClick={handleConfirm} disabled={isConfirming}>
          {isConfirming ? 'Recording…' : 'Confirm Time →'}
        </button>
      </div>
    </div>
  );
}
