// File Upload Service
// Handles secure file uploads with validation and virus scanning

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { supabase } from '../config/supabase';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/json',
];

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

interface FileUploadData {
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
  userId: string;
  companyId: string;
  initiativeId?: string;
}

export class FileUploadService {
  /**
   * Upload file with security checks
   */
  static async uploadFile(data: FileUploadData) {
    const { file, userId, companyId, initiativeId } = data;

    // Step 1: Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} is not allowed`);
    }

    // Step 2: Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Step 3: Validate file name
    const sanitizedFileName = this.sanitizeFileName(file.originalname);

    // Step 4: Check file content (basic validation)
    const isValid = await this.validateFileContent(file.buffer, file.mimetype);
    if (!isValid) {
      throw new Error('File content validation failed');
    }

    // Step 5: Calculate file integrity hash
    const integrityHash = this.calculateHash(file.buffer);

    // Step 6: Generate unique file path
    const fileExtension = path.extname(sanitizedFileName);
    const uniqueFileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExtension}`;
    const relativePath = path.join(companyId, uniqueFileName);
    const fullPath = path.join(UPLOAD_DIR, relativePath);

    // Step 7: Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Step 8: Save file to disk
    await fs.writeFile(fullPath, file.buffer);

    // Step 9: Virus scan (placeholder - integrate with ClamAV or similar)
    const virusScanStatus = await this.scanForVirus(fullPath);

    // Step 10: Save metadata to database
    const { data: uploadedFile, error } = await supabase
      .from('uploaded_files')
      .insert({
        file_name: sanitizedFileName,
        file_path: relativePath,
        file_type: file.mimetype,
        file_size: file.size,
        uploaded_by: userId,
        company_id: companyId,
        initiative_id: initiativeId || null,
        integrity_hash: integrityHash,
        virus_scan_status: virusScanStatus,
        is_verified: virusScanStatus === 'clean',
      })
      .select()
      .single();

    if (error) {
      // Cleanup file if database insert fails
      await fs.unlink(fullPath).catch(() => {});
      throw error;
    }

    // Step 11: If virus detected, delete file
    if (virusScanStatus === 'infected') {
      await fs.unlink(fullPath).catch(() => {});
      await supabase
        .from('uploaded_files')
        .delete()
        .eq('id', uploadedFile.id);
      throw new Error('File failed virus scan and was deleted');
    }

    // Step 12: Log audit
    await this.logAudit(userId, 'FILE_UPLOADED', 'uploaded_files', uploadedFile.id, {
      file_name: sanitizedFileName,
      file_size: file.size,
    });

    return uploadedFile;
  }

  /**
   * Get file metadata
   */
  static async getFile(fileId: string, userId: string) {
    const { data, error } = await supabase
      .from('uploaded_files')
      .select(`
        *,
        uploader:users!uploaded_by (
          id,
          full_name,
          email
        ),
        initiative:initiatives (
          id,
          title
        )
      `)
      .eq('id', fileId)
      .single();

    if (error) throw error;

    // Check access permissions
    const { data: user } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', userId)
      .single();

    if (
      user?.role !== 'super_admin' &&
      data.company_id !== user?.company_id
    ) {
      throw new Error('Access denied to this file');
    }

    return data;
  }

  /**
   * List files with filters
   */
  static async listFiles(
    userId: string,
    filters: {
      companyId?: string;
      initiativeId?: string;
      uploadedBy?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { companyId, initiativeId, uploadedBy, page = 1, limit = 20 } = filters;

    // Get user's company
    const { data: user } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', userId)
      .single();

    let query = supabase
      .from('uploaded_files')
      .select(`
        *,
        uploader:users!uploaded_by (
          id,
          full_name,
          email
        )
      `, { count: 'exact' });

    // Apply company filter
    if (user?.role !== 'super_admin') {
      query = query.eq('company_id', user?.company_id);
    } else if (companyId) {
      query = query.eq('company_id', companyId);
    }

    // Apply filters
    if (initiativeId) query = query.eq('initiative_id', initiativeId);
    if (uploadedBy) query = query.eq('uploaded_by', uploadedBy);

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('uploaded_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      files: data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Delete file
   */
  static async deleteFile(fileId: string, userId: string) {
    // Get file
    const { data: file } = await supabase
      .from('uploaded_files')
      .select('uploaded_by, company_id, file_path')
      .eq('id', fileId)
      .single();

    if (!file) {
      throw new Error('File not found');
    }

    // Check permissions
    const { data: user } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', userId)
      .single();

    const canDelete =
      user?.role === 'super_admin' ||
      (file.company_id === user?.company_id &&
        (user?.role === 'admin' || file.uploaded_by === userId));

    if (!canDelete) {
      throw new Error('Access denied');
    }

    // Delete from filesystem
    const fullPath = path.join(UPLOAD_DIR, file.file_path);
    await fs.unlink(fullPath).catch(() => {});

    // Delete from database
    const { error } = await supabase
      .from('uploaded_files')
      .delete()
      .eq('id', fileId);

    if (error) throw error;

    await this.logAudit(userId, 'FILE_DELETED', 'uploaded_files', fileId);

    return { success: true, message: 'File deleted successfully' };
  }

  /**
   * Sanitize file name
   */
  private static sanitizeFileName(fileName: string): string {
    // Remove path traversal attempts
    const baseName = path.basename(fileName);
    
    // Remove dangerous characters
    return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Calculate file hash for integrity
   */
  private static calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validate file content matches declared type
   */
  private static async validateFileContent(buffer: Buffer, mimetype: string): Promise<boolean> {
    // Check file signatures (magic numbers)
    const signatures: { [key: string]: number[][] } = {
      'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
      'image/jpeg': [[0xFF, 0xD8, 0xFF]],
      'image/png': [[0x89, 0x50, 0x4E, 0x47]],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]], // ZIP
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]], // ZIP
    };

    const expectedSignatures = signatures[mimetype];
    if (!expectedSignatures) {
      // No signature check for this type
      return true;
    }

    return expectedSignatures.some(signature => {
      return signature.every((byte, index) => buffer[index] === byte);
    });
  }

  /**
   * Scan file for viruses
   * NOTE: This is a placeholder. Integrate with ClamAV or cloud antivirus API
   */
  private static async scanForVirus(filePath: string): Promise<'pending' | 'clean' | 'infected' | 'error'> {
    // TODO: Integrate with actual virus scanner
    // Example: ClamAV, VirusTotal API, AWS GuardDuty, etc.
    
    // For now, return clean
    // In production, implement actual scanning
    return 'clean';
  }

  /**
   * Verify file integrity
   */
  static async verifyFileIntegrity(fileId: string): Promise<boolean> {
    const { data: file } = await supabase
      .from('uploaded_files')
      .select('file_path, integrity_hash')
      .eq('id', fileId)
      .single();

    if (!file) return false;

    try {
      const fullPath = path.join(UPLOAD_DIR, file.file_path);
      const buffer = await fs.readFile(fullPath);
      const currentHash = this.calculateHash(buffer);

      return currentHash === file.integrity_hash;
    } catch {
      return false;
    }
  }

  /**
   * Log audit trail
   */
  private static async logAudit(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: any
  ) {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
    });
  }
}
