// File Upload Routes
import express from 'express';
import multer from 'multer';
import { FileUploadService } from '../services/file-upload.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/files/upload
 * Upload a file
 */
router.post('/upload', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    if (!companyId) {
      return res.status(400).json({ error: 'User must belong to a company' });
    }

    const { initiativeId } = req.body;

    const uploadedFile = await FileUploadService.uploadFile({
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      },
      userId,
      companyId,
      initiativeId,
    });

    res.status(201).json(uploadedFile);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/files
 * List files with filters
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { initiativeId, uploadedBy, page, limit } = req.query;

    const result = await FileUploadService.listFiles(userId, {
      initiativeId: initiativeId as string,
      uploadedBy: uploadedBy as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/files/:id
 * Get file metadata
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const file = await FileUploadService.getFile(id, userId);
    res.json(file);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/files/:id
 * Delete file
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const result = await FileUploadService.deleteFile(id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/files/:id/verify-integrity
 * Verify file integrity
 */
router.get('/:id/verify-integrity', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const isValid = await FileUploadService.verifyFileIntegrity(id);
    res.json({ isValid });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
