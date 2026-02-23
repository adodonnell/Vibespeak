// File Attachments API
// Handles file uploads for messages with security validation

import { logger } from '../utils/logger.js';
import { query, queryOne } from '../db/database.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// File attachment record
export interface FileAttachment {
  id: number;
  message_id: number | null;
  uploader_id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  url: string;
  width: number | null;   // For images/videos
  height: number | null;  // For images/videos
  created_at: Date;
}

// Magic numbers for file type validation (first few bytes)
const FILE_SIGNATURES: Record<string, { signature: Buffer; mime: string }[]> = {
  // Images
  '.jpg': [
    { signature: Buffer.from([0xFF, 0xD8, 0xFF]), mime: 'image/jpeg' },
  ],
  '.jpeg': [
    { signature: Buffer.from([0xFF, 0xD8, 0xFF]), mime: 'image/jpeg' },
  ],
  '.png': [
    { signature: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), mime: 'image/png' },
  ],
  '.gif': [
    { signature: Buffer.from('GIF87a'), mime: 'image/gif' },
    { signature: Buffer.from('GIF89a'), mime: 'image/gif' },
  ],
  '.webp': [
    { signature: Buffer.from([0x52, 0x49, 0x46, 0x46]), mime: 'image/webp' }, // RIFF
  ],
  
  // Videos
  '.mp4': [
    { signature: Buffer.from([0x00, 0x00, 0x00]), mime: 'video/mp4' }, // ftyp box starts after
    { signature: Buffer.from('ftyp'), mime: 'video/mp4' },
  ],
  '.webm': [
    { signature: Buffer.from([0x1A, 0x45, 0xDF, 0xA3]), mime: 'video/webm' },
  ],
  
  // Audio
  '.mp3': [
    { signature: Buffer.from([0xFF, 0xFB]), mime: 'audio/mpeg' },
    { signature: Buffer.from([0xFF, 0xFA]), mime: 'audio/mpeg' },
    { signature: Buffer.from([0x49, 0x44, 0x33]), mime: 'audio/mpeg' }, // ID3
  ],
  '.wav': [
    { signature: Buffer.from('RIFF'), mime: 'audio/wav' },
  ],
  '.ogg': [
    { signature: Buffer.from('OggS'), mime: 'audio/ogg' },
  ],
  
  // Documents
  '.pdf': [
    { signature: Buffer.from('%PDF'), mime: 'application/pdf' },
  ],
  '.zip': [
    { signature: Buffer.from([0x50, 0x4B, 0x03, 0x04]), mime: 'application/zip' },
  ],
};

// Dangerous file extensions that should never be allowed
const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.msi', '.msp', '.cpl', '.gadget', '.hta', '.inf', '.jse', '.lnk', '.mde',
  '.msc', '.mst', '.ps1', '.ps2', '.psm1', '.sh', '.app', '.deb', '.rpm',
  '.dmg', '.pkg', '.run', '.bin', '.appimage', '.out', '.elf',
  // Web dangerous
  '.html', '.htm', '.xhtml', '.php', '.asp', '.aspx', '.jsp', '.cgi', '.pl',
  '.py', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.java', '.cs',
  '.sh', '.bash', '.zsh', '.fish',
  // Script dangerous
  '.wsf', '.wsc', '.wsh', '.xbap', '.application', '.mht', '.mhtml',
];

// Allowed file extensions with their MIME types
const ALLOWED_EXTENSIONS: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  
  // Videos
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg',
  
  // Audio
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.weba': 'audio/webm', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.aac': 'audio/aac', '.oga': 'audio/ogg',
  
  // Documents
  '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.json': 'application/json', '.xml': 'application/xml',
  '.rtf': 'application/rtf', '.odt': 'application/vnd.oasis.opendocument.text',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Archives (safe for sharing)
  '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed', '.rar': 'application/vnd.rar',
  
  // Fonts (safe)
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// Upload configuration - loaded from environment
function getUploadConfig() {
  return {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB default
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    baseUrl: process.env.UPLOAD_URL || '/uploads',
    allowedExtensions: Object.keys(ALLOWED_EXTENSIONS),
    maxFilesPerMessage: 10,
    // Rate limiting per user
    maxUploadsPerHour: 50,
    maxUploadsPerDay: 200,
  };
}

// Ensure upload directory exists
function ensureUploadDir(): void {
  const config = getUploadConfig();
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    logger.info(`Created upload directory: ${config.uploadDir}`);
  }
}

// Generate unique filename
function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.randomBytes(24).toString('hex');
  const date = new Date().toISOString().split('T')[0];
  return `${date}/${hash}${ext}`;
}

// Sanitize filename - remove dangerous characters
function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = path.basename(filename);
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Remove any characters that could be problematic
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  
  // Limit length
  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  if (base.length > 200) {
    sanitized = base.substring(0, 200) + ext;
  }
  
  return sanitized;
}

// Validate file signature (magic number)
function validateFileSignature(buffer: Buffer, extension: string): { valid: boolean; detectedMime?: string } {
  const ext = extension.toLowerCase();
  
  // Check if we have signatures for this extension
  const signatures = FILE_SIGNATURES[ext];
  if (!signatures) {
    // No known signature for this file type - allow but log
    logger.debug(`No signature validation for extension: ${ext}`);
    return { valid: true };
  }
  
  // Check if buffer starts with any known signature
  for (const sig of signatures) {
    if (buffer.length >= sig.signature.length) {
      const header = buffer.subarray(0, sig.signature.length);
      
      // For some formats like MP4, the signature might be at offset 4
      if (ext === '.mp4' && buffer.length > 8) {
        const ftypOffset = buffer.indexOf(Buffer.from('ftyp'));
        if (ftypOffset !== -1 && ftypOffset < 20) {
          return { valid: true, detectedMime: 'video/mp4' };
        }
      }
      
      // For WebP, check for RIFF header and WEBP marker
      if (ext === '.webp' && buffer.length > 12) {
        const riffMatch = buffer.subarray(0, 4).equals(Buffer.from('RIFF'));
        const webpMatch = buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
        if (riffMatch && webpMatch) {
          return { valid: true, detectedMime: 'image/webp' };
        }
      }
      
      // Direct signature match
      if (header.equals(sig.signature)) {
        return { valid: true, detectedMime: sig.mime };
      }
    }
  }
  
  // No matching signature found
  logger.warn(`File signature mismatch for extension: ${ext}`);
  return { valid: false };
}

// Check for embedded malicious content
function scanForMaliciousContent(buffer: Buffer, mimeType: string): { safe: boolean; reason?: string } {
  // Check for embedded scripts in images
  if (mimeType.startsWith('image/')) {
    const bufferStr = buffer.toString('utf8');
    
    // Check for embedded HTML/JS (common in XSS attacks)
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /data:/i,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(bufferStr)) {
        return { safe: false, reason: 'Potentially malicious content detected' };
      }
    }
  }
  
  // Check for polyglot files (files that are valid in multiple formats)
  // This is a basic check - production would use more sophisticated detection
  if (buffer.length > 100) {
    const header = buffer.subarray(0, 100).toString('utf8');
    
    // Check for HTML-like content at the start
    if (/<html|<!doctype|<head|<body/i.test(header)) {
      return { safe: false, reason: 'File appears to be HTML disguised as another format' };
    }
  }
  
  return { safe: true };
}

class FileService {
  /**
   * Save a file (buffer) to storage and create database record
   */
  async uploadFile(
    uploaderId: number,
    filename: string,
    buffer: Buffer,
    providedMimeType?: string
  ): Promise<FileAttachment> {
    ensureUploadDir();
    const config = getUploadConfig();
    
    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(filename);
    const ext = path.extname(sanitizedFilename).toLowerCase();
    
    // Check for dangerous extensions
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      throw new Error(`File type not allowed: ${ext} files are blocked for security`);
    }
    
    // Check if extension is allowed
    if (!ALLOWED_EXTENSIONS[ext]) {
      throw new Error(`File type not allowed. Allowed types: ${Object.keys(ALLOWED_EXTENSIONS).join(', ')}`);
    }
    
    // Validate file size
    if (buffer.length === 0) {
      throw new Error('Empty file not allowed');
    }
    
    if (buffer.length > config.maxFileSize) {
      throw new Error(`File too large. Maximum size is ${(config.maxFileSize / 1024 / 1024).toFixed(1)}MB`);
    }
    
    // Validate file signature (magic number check)
    const signatureCheck = validateFileSignature(buffer, ext);
    if (!signatureCheck.valid) {
      throw new Error('File content does not match its extension. Possible file type spoofing detected.');
    }
    
    // Determine MIME type
    const detectedMime = signatureCheck.detectedMime || ALLOWED_EXTENSIONS[ext] || 'application/octet-stream';
    
    // Scan for malicious content
    const maliciousCheck = scanForMaliciousContent(buffer, detectedMime);
    if (!maliciousCheck.safe) {
      logger.warn(`Malicious content detected in upload by user ${uploaderId}: ${maliciousCheck.reason}`);
      throw new Error(maliciousCheck.reason || 'File contains potentially dangerous content');
    }
    
    // Generate unique storage path
    const storagePath = generateFilename(sanitizedFilename);
    const fullPath = path.join(config.uploadDir, storagePath);
    
    // Ensure subdirectory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file to disk with restricted permissions
    fs.writeFileSync(fullPath, buffer, { mode: 0o644 });
    
    // Create URL path
    const url = `${config.baseUrl}/${storagePath}`;
    
    // Get image dimensions if applicable (would need sharp library in production)
    let width: number | null = null;
    let height: number | null = null;
    
    // Insert into database
    const result = await query(
      `INSERT INTO file_attachments (uploader_id, filename, original_name, mime_type, size, url, width, height, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [uploaderId, storagePath, sanitizedFilename, detectedMime, buffer.length, url, width, height]
    );
    
    const attachment = result.rows[0] as FileAttachment;
    logger.info(`File uploaded: ${sanitizedFilename} (${buffer.length} bytes, ${detectedMime}) by user ${uploaderId}`);
    
    return attachment;
  }

  /**
   * Attach an uploaded file to a message
   */
  async attachToMessage(fileId: number, messageId: number): Promise<void> {
    await query(
      'UPDATE file_attachments SET message_id = $1 WHERE id = $2',
      [messageId, fileId]
    );
  }

  /**
   * Get attachments for a message
   */
  async getMessageAttachments(messageId: number): Promise<FileAttachment[]> {
    const result = await query(
      'SELECT * FROM file_attachments WHERE message_id = $1 ORDER BY created_at',
      [messageId]
    );
    return result.rows as FileAttachment[];
  }

  /**
   * Get a file by ID
   */
  async getFile(fileId: number): Promise<FileAttachment | null> {
    return queryOne<FileAttachment>(
      'SELECT * FROM file_attachments WHERE id = $1',
      [fileId]
    );
  }

  /**
   * Delete a file (hard delete)
   */
  async deleteFile(fileId: number, userId: number): Promise<boolean> {
    const file = await this.getFile(fileId);
    if (!file || file.uploader_id !== userId) {
      return false;
    }
    
    // Delete from database
    const result = await query(
      'DELETE FROM file_attachments WHERE id = $1',
      [fileId]
    );
    
    // Delete from disk
    const config = getUploadConfig();
    const fullPath = path.join(config.uploadDir, file.filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.debug(`File deleted from disk: ${fullPath}`);
    }
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get upload configuration for clients
   */
  getConfig() {
    return {
      maxFileSize: getUploadConfig().maxFileSize,
      allowedExtensions: Object.keys(ALLOWED_EXTENSIONS),
      maxFilesPerMessage: getUploadConfig().maxFilesPerMessage,
    };
  }

  /**
   * Get file path for serving
   */
  getFilePath(filename: string): string | null {
    const config = getUploadConfig();
    
    // Sanitize to prevent path traversal
    const sanitized = path.basename(filename);
    if (sanitized !== filename) {
      logger.warn(`Path traversal attempt in file request: ${filename}`);
      return null;
    }
    
    const fullPath = path.join(config.uploadDir, sanitized);
    
    // Ensure we're not escaping the upload directory
    const resolved = path.resolve(fullPath);
    const uploadDir = path.resolve(config.uploadDir);
    if (!resolved.startsWith(uploadDir)) {
      logger.warn(`Path traversal attempt resolved outside upload dir: ${filename}`);
      return null;
    }
    
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  /**
   * Calculate SHA256 hash of file for integrity verification
   */
  calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check if user has exceeded upload rate limits
   */
  async checkRateLimit(userId: number): Promise<{ allowed: boolean; remaining: number; resetAt?: Date }> {
    const config = getUploadConfig();
    
    // Check uploads in the last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyResult = await query(
      'SELECT COUNT(*) as count FROM file_attachments WHERE uploader_id = $1 AND created_at > $2',
      [userId, hourAgo]
    );
    const hourlyCount = parseInt(hourlyResult.rows[0]?.count || '0', 10);
    
    if (hourlyCount >= config.maxUploadsPerHour) {
      return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + 60 * 60 * 1000) };
    }
    
    // Check uploads in the last day
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyResult = await query(
      'SELECT COUNT(*) as count FROM file_attachments WHERE uploader_id = $1 AND created_at > $2',
      [userId, dayAgo]
    );
    const dailyCount = parseInt(dailyResult.rows[0]?.count || '0', 10);
    
    if (dailyCount >= config.maxUploadsPerDay) {
      return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    }
    
    return { 
      allowed: true, 
      remaining: Math.min(
        config.maxUploadsPerHour - hourlyCount,
        config.maxUploadsPerDay - dailyCount
      )
    };
  }
}

export const fileService = new FileService();

// Create the file_attachments table if it doesn't exist
export async function initFileAttachmentsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS file_attachments (
      id SERIAL PRIMARY KEY,
      message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      uploader_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size INTEGER NOT NULL,
      url VARCHAR(500) NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  await query(`CREATE INDEX IF NOT EXISTS idx_file_attachments_message_id ON file_attachments(message_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_file_attachments_uploader_id ON file_attachments(uploader_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_file_attachments_created_at ON file_attachments(created_at)`);
  
  logger.info('File attachments table initialized');
}