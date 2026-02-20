import React, { useCallback, useState, useEffect } from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  minSize?: number;
  maxSize?: number;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ 
  direction, 
  onResize,
  minSize = 100,
  maxSize = 600
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartPos(direction === 'horizontal' ? e.clientX : e.clientY);
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;
      onResize(delta);
      setStartPos(currentPos);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, onResize, startPos]);

  return (
    <div
      className={`resize-handle resize-handle-${direction} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
};

export default ResizeHandle;
