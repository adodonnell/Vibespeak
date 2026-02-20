import React from 'react';

interface SpectrogramProps {
  data: number[];
  barCount?: number;
}

const Spectrogram: React.FC<SpectrogramProps> = ({ 
  data,
  barCount = 20
}) => {
  // Pad or truncate data to match barCount
  const normalizedData = [...data];
  while (normalizedData.length < barCount) {
    normalizedData.unshift(0);
  }
  while (normalizedData.length > barCount) {
    normalizedData.shift();
  }

  return (
    <div className="spectrogram">
      <div className="spectrogram-bar">
        {normalizedData.map((value, index) => (
          <span 
            key={index}
            style={{ 
              height: `${Math.max(4, value)}%`,
              opacity: value > 0 ? 0.5 + (value / 200) : 0.2
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default Spectrogram;
