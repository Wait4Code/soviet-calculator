import { useState, useRef, useEffect } from 'react';

export function Tooltip({
  children,
  content,
  placement = 'top',
}: {
  children: React.ReactNode;
  content: string;
  placement?: 'top' | 'right';
}) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), 100);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const tooltipClasses =
    placement === 'right'
      ? 'absolute z-50 left-full ml-1 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-normal max-w-[240px]'
      : 'absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap bottom-full right-0 mb-1';

  const arrowClasses =
    placement === 'right'
      ? 'absolute top-1/2 -translate-y-1/2 right-full border-4 border-transparent border-r-gray-900'
      : 'absolute top-full right-4 border-4 border-transparent border-t-gray-900';

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div className={tooltipClasses}>
          {content}
          <div className={arrowClasses} />
        </div>
      )}
    </div>
  );
}
