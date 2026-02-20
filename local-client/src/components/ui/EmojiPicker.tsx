import React, { useState } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

interface EmojiPickerButtonProps {
  onEmojiClick: (emoji: string) => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

const EmojiPickerButton: React.FC<EmojiPickerButtonProps> = ({ onEmojiClick, buttonRef }) => {
  const [showPicker, setShowPicker] = useState(false);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiClick(emojiData.emoji);
    setShowPicker(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Add emoji"
      >
        😊
      </button>
      
      {showPicker && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '0',
          zIndex: 1000,
          marginBottom: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
        <EmojiPicker
            onEmojiClick={handleEmojiClick}
            width={320}
            height={400}
            theme={Theme.DARK}
            previewConfig={{ showPreview: false }}
            skinTonesDisabled
          />
        </div>
      )}
      
      {showPicker && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
          onClick={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default EmojiPickerButton;
