import React, { useState, useEffect } from 'react';

export interface EmbedData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  thumbnail?: string;
  siteName?: string;
  authorName?: string;
  authorUrl?: string;
  providerName?: string;
  providerUrl?: string;
  html?: string;
  width?: number;
  height?: number;
  color?: string;
  type?: 'link' | 'image' | 'video' | 'rich';
}

interface EmbedProps {
  url: string;
  onOpenLink?: (url: string) => void;
  className?: string;
}

const Embed: React.FC<EmbedProps> = ({ url, onOpenLink, className = '' }) => {
  const [embedData, setEmbedData] = useState<EmbedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // For now, we'll extract basic info from the URL
    // In production, you'd call a link preview API
    const fetchEmbedData = async () => {
      setLoading(true);
      try {
        // Basic URL parsing - extract domain for display
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace('www.', '');
        
        // Create embed data from URL
        const data: EmbedData = {
          url,
          title: hostname.charAt(0).toUpperCase() + hostname.slice(1),
          description: url,
          siteName: hostname,
        };

        // Try to detect if it's an image
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const isImage = imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
        
        if (isImage) {
          data.image = url;
          data.type = 'image';
        }

        setEmbedData(data);
      } catch (err) {
        setError('Invalid URL');
      } finally {
        setLoading(false);
      }
    };

    if (url) {
      fetchEmbedData();
    }
  }, [url]);

  const handleClick = () => {
    if (onOpenLink) {
      onOpenLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className={className} style={{
        background: '#2b2d31',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '4px',
          background: '#1e1f22',
          animation: 'pulse 1.5s infinite',
        }} />
        <div>
          <div style={{
            width: '120px',
            height: '14px',
            background: '#1e1f22',
            borderRadius: '4px',
            marginBottom: '6px',
          }} />
          <div style={{
            width: '200px',
            height: '12px',
            background: '#1e1f22',
            borderRadius: '4px',
          }} />
        </div>
      </div>
    );
  }

  if (error || !embedData) {
    return null;
  }

  // Image embed
  if (embedData.image) {
    return (
      <div 
        className={className}
        onClick={handleClick}
        style={{
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'pointer',
          maxWidth: '400px',
        }}
      >
        <img 
          src={embedData.image} 
          alt={embedData.title || 'Image'}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
          }}
        />
      </div>
    );
  }

  // Rich link embed
  return (
    <div 
      className={className}
      onClick={handleClick}
      style={{
        background: '#2b2d31',
        borderLeft: `4px solid ${embedData.color || '#5865f2'}`,
        borderRadius: '4px',
        padding: '12px',
        cursor: 'pointer',
        maxWidth: '432px',
      }}
    >
      {/* Provider */}
      {embedData.providerName && (
        <div style={{
          fontSize: '12px',
          color: '#949ba4',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          {embedData.providerUrl && (
            <img 
              src={`https://www.google.com/s2/favicons?domain=${embedData.providerUrl}&sz=32`}
              alt=""
              style={{ width: '14px', height: '14px', borderRadius: '2px' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          {embedData.providerName}
        </div>
      )}

      {/* Title */}
      {embedData.title && (
        <div style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#00b0f4',
          marginBottom: '4px',
        }}>
          {embedData.title}
        </div>
      )}

      {/* Description */}
      {embedData.description && (
        <div style={{
          fontSize: '13px',
          color: '#dbdee1',
          marginBottom: '8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {embedData.description}
        </div>
      )}

      {/* Thumbnail */}
      {embedData.thumbnail && (
        <div style={{
          marginTop: '8px',
        }}>
          <img 
            src={embedData.thumbnail} 
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '200px',
              borderRadius: '4px',
            }}
          />
        </div>
      )}

      {/* Author */}
      {embedData.authorName && (
        <div style={{
          fontSize: '12px',
          color: '#949ba4',
          marginTop: '8px',
        }}>
          {embedData.authorName}
        </div>
      )}
    </div>
  );
};

// Component to parse URLs from message content and render embeds
interface EmbedParserProps {
  content: string;
  onOpenLink?: (url: string) => void;
}

export const EmbedParser: React.FC<EmbedParserProps> = ({ content, onOpenLink }) => {
  const [embeds, setEmbeds] = useState<{ text: string; url: string }[]>([]);

  useEffect(() => {
    // Regex to find URLs in text
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
    const matches = content.match(urlRegex);
    
    if (matches) {
      const parts: { text: string; url: string }[] = [];
      let lastIndex = 0;
      
      matches.forEach(url => {
        const index = content.indexOf(url, lastIndex);
        if (index > lastIndex) {
          parts.push({ text: content.slice(lastIndex, index), url: '' });
        }
        parts.push({ text: url, url });
        lastIndex = index + url.length;
      });
      
      if (lastIndex < content.length) {
        parts.push({ text: content.slice(lastIndex), url: '' });
      }
      
      setEmbeds(parts);
    } else {
      setEmbeds([{ text: content, url: '' }]);
    }
  }, [content]);

  return (
    <>
      {embeds.map((part, index) => (
        part.url ? (
          <Embed key={index} url={part.url} onOpenLink={onOpenLink} />
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      ))}
    </>
  );
};

export default Embed;
