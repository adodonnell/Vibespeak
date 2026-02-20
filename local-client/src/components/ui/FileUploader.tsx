import React, { useState, useCallback } from 'react';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  thumbnail?: string;
}

interface FileUploaderProps {
  onFileUpload?: (file: UploadedFile) => void;
  onFilesSelect?: (files: File[]) => void;
  acceptedTypes?: string[];
  maxSize?: number; // in MB
  multiple?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileUpload,
  onFilesSelect,
  acceptedTypes = ['image/*', 'video/*', 'audio/*', '.pdf', '.doc', '.docx', '.txt'],
  maxSize = 10,
  multiple = true,
  className = '',
  children
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];

    for (const file of fileArray) {
      // Check size
      if (file.size > maxSize * 1024 * 1024) {
        console.warn(`File ${file.name} exceeds max size of ${maxSize}MB`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      onFilesSelect?.(validFiles);
      
      // Simulate upload and create preview URLs
      validFiles.forEach(file => {
        const fileId = `${Date.now()}-${file.name}`;
        
        // Create object URL for preview
        const url = URL.createObjectURL(file);
        
        // Determine if we can generate a thumbnail
        let thumbnail: string | undefined;
        if (file.type.startsWith('image/')) {
          thumbnail = url;
        }

        const uploadedFile: UploadedFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          url,
          thumbnail
        };

        onFileUpload?.(uploadedFile);
      });
    }
  }, [maxSize, onFileUpload, onFilesSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    // Reset input
    e.target.value = '';
  }, [processFiles]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      className={`file-uploader ${className}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        border: isDragging ? '2px dashed #5865f2' : '2px dashed transparent',
        borderRadius: '8px',
        padding: isDragging ? '20px' : '0',
        transition: 'all 0.2s ease',
        background: isDragging ? 'rgba(88, 101, 242, 0.1)' : 'transparent',
      }}
    >
      <input
        type="file"
        multiple={multiple}
        accept={acceptedTypes.join(',')}
        onChange={handleFileInput}
        id="file-upload-input"
        style={{ display: 'none' }}
      />
      
      {isDragging && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.7)',
          borderRadius: '8px',
          zIndex: 10,
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
            <div style={{ fontSize: '16px', fontWeight: 500 }}>Drop files here</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>
              Max {maxSize}MB per file
            </div>
          </div>
        </div>
      )}

      {/* Render children or default trigger */}
      {children || (
        <label
          htmlFor="file-upload-input"
          style={{
            display: 'block',
            cursor: 'pointer',
            padding: '8px',
          }}
          title="Click or drag files to upload"
        >
          <span style={{
            opacity: 0,
            fontSize: '1px',
          }}>
            Upload files
          </span>
        </label>
      )}
    </div>
  );
};

// Preview component for uploaded files
interface FilePreviewProps {
  file: UploadedFile;
  onRemove?: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: '#2b2d31',
      borderRadius: '8px',
      margin: '4px',
    }}>
      {/* Thumbnail or icon */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '4px',
        overflow: 'hidden',
        background: '#1e1f22',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
      }}>
        {isImage && file.thumbnail ? (
          <img src={file.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : isVideo ? (
          '🎬'
        ) : isAudio ? (
          '🎵'
        ) : (
          '📄'
        )}
      </div>

      {/* File info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '150px',
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: '11px', color: '#949ba4' }}>
          {formatFileSize(file.size)}
        </div>
      </div>

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            padding: '4px',
            border: 'none',
            background: 'transparent',
            color: '#949ba4',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
          title="Remove file"
        >
          ✕
        </button>
      )}
    </div>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default FileUploader;
